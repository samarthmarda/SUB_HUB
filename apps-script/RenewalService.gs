/**
 * SUBSCRIPTION HUB — RenewalService.gs
 * Renewal queues. Reflects the current date automatically so the owner never has
 * to scan all customers. Views: upcoming | 7days | 3days | today | overdue | renewed.
 */

function latestReminderBySubscription_() {
  var reminders = readTable_('ReminderLogs');
  var map = {};
  reminders.forEach(function (r) {
    var sid = String(r.subscription_id);
    var cur = map[sid];
    if (!cur ||
      String(r.scheduled_date) > String(cur.scheduled_date) ||
      (String(r.scheduled_date) === String(cur.scheduled_date) && String(r.generated_at) > String(cur.generated_at))) {
      map[sid] = r;
    }
  });
  return map;
}

function getRenewals_(token, view) {
  requireSession_(token);
  view = cleanStr_(view) || 'upcoming';
  var subs = readTable_('Subscriptions');
  var customers = readTable_('Customers');
  var custById = {};
  customers.forEach(function (c) { custById[String(c.customer_id)] = c; });

  var payMap = aggregatePaymentsBySubscription_();
  var remBySub = latestReminderBySubscription_();
  var today = todayISO_();
  var in3 = addDaysISO_(today, 3);
  var in7 = addDaysISO_(today, 7);

  var items = subs.map(function (s) {
    var d = decorateSubscription_(s, payMap);
    var cust = custById[String(s.customer_id)] || {};
    var rem = remBySub[String(s.subscription_id)];
    return {
      subscription_id: s.subscription_id,
      customer_id: s.customer_id,
      customer_name: cust.full_name || '',
      customer_code: cust.customer_code || '',
      phone_e164: cust.phone_e164 || '',
      plan_name: d.plan_name,
      start_date: s.start_date,
      expiry_date: s.expiry_date,
      days_remaining: daysFromToday_(s.expiry_date),
      subscription_amount: d.amount_due,
      outstanding: d.outstanding,
      payment_status: d.payment_status,
      activation_status: d.activation_status,
      date_status: d.date_status,
      is_archived: toBool_(cust.is_archived),
      renewed: !!String(s.renewed_by_subscription_id),
      reminder_id: rem ? rem.reminder_id : '',
      reminder_status: rem ? rem.status : 'None',
      reminder_type: rem ? rem.reminder_type : '',
      followup_status: rem ? rem.followup_status : 'None',
    };
  });

  // Archived customers are excluded from active renewal queues.
  items = items.filter(function (i) { return !i.is_archived; });

  function notDone(i) { return !i.renewed && i.activation_status !== 'Cancelled'; }

  if (view === 'today') {
    items = items.filter(function (i) { return i.expiry_date === today && notDone(i); });
  } else if (view === '3days') {
    items = items.filter(function (i) { return i.expiry_date >= today && i.expiry_date <= in3 && notDone(i); });
  } else if (view === '7days') {
    items = items.filter(function (i) { return i.expiry_date >= today && i.expiry_date <= in7 && notDone(i); });
  } else if (view === 'overdue') {
    items = items.filter(function (i) { return i.expiry_date < today && notDone(i); });
  } else if (view === 'renewed') {
    items = items.filter(function (i) { return i.renewed; });
  } else { // upcoming
    items = items.filter(function (i) { return i.expiry_date >= today && notDone(i); });
  }

  items.sort(function (a, b) {
    var d = String(a.expiry_date).localeCompare(String(b.expiry_date));
    if (d !== 0) return d;
    return String(a.customer_name).localeCompare(String(b.customer_name));
  });

  return { view: view, generated_on: today, count: items.length, items: items };
}

/** Counts used by the dashboard Action Queue (single pass). */
function getRenewalCounts_() {
  var subs = readTable_('Subscriptions').filter(function (s) { return String(s.activation_status) !== 'Cancelled'; });
  var customers = readTable_('Customers');
  var archived = {};
  customers.forEach(function (c) { if (toBool_(c.is_archived)) archived[String(c.customer_id)] = true; });
  var today = todayISO_();
  var in3 = addDaysISO_(today, 3);
  var in7 = addDaysISO_(today, 7);
  var counts = { today: 0, in3: 0, in7: 0, overdue: 0, renewed: 0 };
  subs.forEach(function (s) {
    if (archived[String(s.customer_id)]) return;
    var renewed = !!String(s.renewed_by_subscription_id);
    if (renewed) { counts.renewed += 1; return; }
    var e = String(s.expiry_date);
    if (e < today) counts.overdue += 1;
    else if (e === today) counts.today += 1;
    if (e >= today && e <= in3) counts.in3 += 1;
    if (e >= today && e <= in7) counts.in7 += 1;
  });
  return counts;
}
