/**
 * SUBSCRIPTION HUB — ReminderService.gs
 * Reminder generation (idempotent, dedup by subscription+type+scheduled date),
 * the WhatsApp Reminder queue, click/sent tracking and follow-ups.
 *
 * The trigger GENERATES reminders only — it never sends WhatsApp messages. The
 * owner clicks WhatsApp and sends manually, then marks it sent in the app.
 */

var CATCHUP_WINDOW_DAYS = 3;

/** Parse the reminder schedule from settings into [{offset, type}]. */
function reminderSchedule_() {
  if (String(getSettingCached_('reminder_enabled')) === 'false') return [];
  var raw = String(getSettingCached_('reminder_days_before') || '7,3,0');
  var out = [];
  raw.split(',').forEach(function (part) {
    var off = parseInt(part.trim(), 10);
    if (!isFinite(off)) return;
    var type = off === 7 ? '7day' : off === 3 ? '3day' : off <= 0 ? 'expiryday' : ('day' + off);
    out.push({ offset: off, type: type });
  });
  return out;
}

function makeReminderRow_(sub, type, scheduled, key) {
  return {
    reminder_id: uuid_(),
    customer_id: String(sub.customer_id),
    subscription_id: String(sub.subscription_id),
    reminder_type: type,
    scheduled_date: scheduled,
    status: 'Pending',
    generated_at: nowISO_(),
    whatsapp_clicked_at: '',
    manually_marked_sent_at: '',
    followup_status: 'None',
    notes: '',
    dedupe_key: key,
  };
}

/**
 * Core generation. Idempotent via dedupe keys. Generates reminders whose scheduled
 * date has arrived (today), with a small catch-up window for missed trigger runs.
 * Suppresses reminders for renewed or cancelled subscriptions.
 */
function generateRemindersInternal_() {
  return withLock_(function () {
    var schedule = reminderSchedule_();
    if (!schedule.length) return { created: 0 };

    var subs = readTable_('Subscriptions').filter(function (s) {
      return String(s.activation_status) === 'Approved' && !String(s.renewed_by_subscription_id);
    });
    var existing = readTable_('ReminderLogs');
    var keys = {};
    existing.forEach(function (r) { keys[String(r.dedupe_key)] = true; });

    var today = todayISO_();
    var windowStart = addDaysISO_(today, -CATCHUP_WINDOW_DAYS);
    var toAdd = [];

    subs.forEach(function (s) {
      var expiry = String(s.expiry_date);
      schedule.forEach(function (item) {
        var scheduled = addDaysISO_(expiry, -item.offset);
        if (!scheduled) return;
        if (scheduled >= windowStart && scheduled <= today) {
          var key = dedupeKey_(s.subscription_id, item.type, scheduled);
          if (!keys[key]) { toAdd.push(makeReminderRow_(s, item.type, scheduled, key)); keys[key] = true; }
        }
      });
      // Overdue/expired nudge (once per subscription).
      if (expiry && expiry < today) {
        var ekey = dedupeKey_(s.subscription_id, 'expired', expiry);
        if (!keys[ekey]) { toAdd.push(makeReminderRow_(s, 'expired', expiry, ekey)); keys[ekey] = true; }
      }
    });

    if (toAdd.length) appendRows_('ReminderLogs', toAdd);
    return { created: toAdd.length };
  });
}

/** API entry (session-guarded). */
function generateReminders_(token) {
  requireSession_(token);
  return generateRemindersInternal_();
}

/** Idempotent catch-up, called when the dashboard / reminder queue loads. */
function ensureRemindersCatchUp_(token) {
  requireSession_(token);
  return generateRemindersInternal_();
}

function getReminderQueue_(token, filters) {
  requireSession_(token);
  filters = filters || {};
  var reminders = readTable_('ReminderLogs');
  var customers = readTable_('Customers');
  var custById = {};
  customers.forEach(function (c) { custById[String(c.customer_id)] = c; });
  var subs = readTable_('Subscriptions');
  var subById = {};
  subs.forEach(function (s) { subById[String(s.subscription_id)] = s; });

  var today = todayISO_();
  var in7 = addDaysISO_(today, 7);

  var items = reminders.map(function (r) {
    var cust = custById[String(r.customer_id)] || {};
    var sub = subById[String(r.subscription_id)] || {};
    return {
      reminder_id: r.reminder_id,
      customer_id: r.customer_id,
      customer_name: cust.full_name || '',
      customer_code: cust.customer_code || '',
      phone_e164: cust.phone_e164 || '',
      subscription_id: r.subscription_id,
      plan_name: sub.plan_name_snapshot || '',
      expiry_date: sub.expiry_date || '',
      reminder_type: r.reminder_type,
      scheduled_date: r.scheduled_date,
      status: r.status,
      generated_at: r.generated_at,
      whatsapp_clicked_at: r.whatsapp_clicked_at || '',
      manually_marked_sent_at: r.manually_marked_sent_at || '',
      followup_status: r.followup_status || 'None',
      notes: r.notes || '',
      is_archived: toBool_(cust.is_archived),
      renewed: !!String(sub.renewed_by_subscription_id),
    };
  });

  items = items.filter(function (i) { return !i.is_archived; });

  var COMPLETED = ['Manually Marked Sent', 'Renewed', 'Not Renewing'];
  var bucket = cleanStr_(filters.bucket);
  if (bucket === 'today') items = items.filter(function (i) { return i.scheduled_date === today; });
  else if (bucket === 'thisweek') items = items.filter(function (i) { return i.scheduled_date >= today && i.scheduled_date <= in7; });
  else if (bucket === 'overdue') items = items.filter(function (i) { return i.scheduled_date < today && i.status === 'Pending'; });
  else if (bucket === 'notcontacted') items = items.filter(function (i) { return i.status === 'Pending'; });
  else if (bucket === 'followuppending') items = items.filter(function (i) { return i.followup_status === 'Pending'; });
  else if (bucket === 'completed') items = items.filter(function (i) { return COMPLETED.indexOf(i.status) !== -1; });

  if (filters.status) items = items.filter(function (i) { return i.status === filters.status; });
  if (filters.reminder_type) items = items.filter(function (i) { return i.reminder_type === filters.reminder_type; });

  items.sort(function (a, b) {
    var d = String(a.scheduled_date).localeCompare(String(b.scheduled_date));
    if (d !== 0) return d;
    return String(b.generated_at).localeCompare(String(a.generated_at));
  });

  return { generated_on: today, count: items.length, items: items };
}

/** Record that the owner opened WhatsApp for a reminder (separate from "sent"). */
function logWhatsAppClick_(token, reminderId) {
  requireSession_(token);
  if (!cleanStr_(reminderId)) throw new HubError_('VALIDATION', 'Reminder ID is required.');
  return withLock_(function () {
    var rem = findById_('ReminderLogs', 'reminder_id', reminderId);
    if (!rem) throw new HubError_('NOT_FOUND', 'Reminder not found.');
    var patch = { whatsapp_clicked_at: nowISO_() };
    if (String(rem.status) === 'Pending') patch.status = 'WhatsApp Clicked';
    updateRowById_('ReminderLogs', 'reminder_id', reminderId, patch);
    return { reminder_id: reminderId, status: patch.status || rem.status };
  });
}

/** Mark a reminder as manually sent by the owner. */
function markReminderSent_(token, reminderId) {
  requireSession_(token);
  if (!cleanStr_(reminderId)) throw new HubError_('VALIDATION', 'Reminder ID is required.');
  return withLock_(function () {
    var rem = findById_('ReminderLogs', 'reminder_id', reminderId);
    if (!rem) throw new HubError_('NOT_FOUND', 'Reminder not found.');
    var patch = { status: 'Manually Marked Sent', manually_marked_sent_at: nowISO_() };
    updateRowById_('ReminderLogs', 'reminder_id', reminderId, patch);
    audit_(token, 'Reminder', reminderId, 'MARK_SENT', { status: rem.status }, patch);
    return { reminder_id: reminderId, status: patch.status };
  });
}

/** Save follow-up status/notes or an outcome (responded, renewed, not renewing...). */
function saveReminderFollowUp_(token, reminderId, patch) {
  requireSession_(token);
  if (!cleanStr_(reminderId)) throw new HubError_('VALIDATION', 'Reminder ID is required.');
  patch = patch || {};
  var allowedStatus = ['Pending', 'WhatsApp Clicked', 'Manually Marked Sent', 'Customer Responded', 'Payment Pending', 'Renewed', 'Not Renewing'];
  var allowedFollowup = ['None', 'Pending', 'Completed'];
  var dbPatch = {};
  if (patch.status !== undefined && allowedStatus.indexOf(patch.status) !== -1) dbPatch.status = patch.status;
  if (patch.followup_status !== undefined && allowedFollowup.indexOf(patch.followup_status) !== -1) dbPatch.followup_status = patch.followup_status;
  if (patch.notes !== undefined) dbPatch.notes = cleanStr_(patch.notes).slice(0, 1000);
  if (!Object.keys(dbPatch).length) return { reminder_id: reminderId };
  return withLock_(function () {
    var rem = findById_('ReminderLogs', 'reminder_id', reminderId);
    if (!rem) throw new HubError_('NOT_FOUND', 'Reminder not found.');
    updateRowById_('ReminderLogs', 'reminder_id', reminderId, dbPatch);
    audit_(token, 'Reminder', reminderId, 'FOLLOWUP', { status: rem.status, followup_status: rem.followup_status }, dbPatch);
    return { reminder_id: reminderId };
  });
}
