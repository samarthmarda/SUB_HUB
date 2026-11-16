/**
 * SUBSCRIPTION HUB — CalendarService.gs
 * Renewal calendar built from actual subscription expiry records.
 * Views: month | week | day. Colour: green=active/upcoming, yellow=approaching,
 * orange=due today, red=expired, grey=cancelled/archived.
 */

function monthRange_(anchor) {
  var start = startOfMonthISO_(anchor);
  var end = addDaysISO_(addDurationISO_(start, 1, 'MONTH'), -1);
  return { from: start, to: end };
}

function weekRange_(anchor) {
  var d = parseISO_(anchor);
  var dow = d.getUTCDay();          // 0 = Sunday
  var offsetToMonday = (dow + 6) % 7; // Monday = 0
  var monday = addDaysISO_(anchor, -offsetToMonday);
  return { from: monday, to: addDaysISO_(monday, 6) };
}

function dayRange_(anchor) {
  return { from: anchor, to: anchor };
}

function colorForStatus_(sub, archived, today) {
  if (String(sub.activation_status) === 'Cancelled') return 'grey';
  if (archived) return 'grey';
  var e = String(sub.expiry_date);
  if (e < today) return 'red';
  if (e === today) return 'orange';
  if (daysFromToday_(e) <= 7) return 'yellow';
  return 'green';
}

function getCalendarEvents_(token, params) {
  requireSession_(token);
  params = params || {};
  var view = ['month', 'week', 'day'].indexOf(params.view) >= 0 ? params.view : 'month';
  var anchor = (params.anchor && parseISO_(params.anchor)) ? params.anchor : todayISO_();
  var today = todayISO_();

  var range = view === 'month' ? monthRange_(anchor) : view === 'week' ? weekRange_(anchor) : dayRange_(anchor);

  var customers = readTable_('Customers');
  var custById = {};
  customers.forEach(function (c) { custById[String(c.customer_id)] = c; });
  var payMap = aggregatePaymentsBySubscription_();

  // Expiry events within range (exclude already-renewed; keep cancelled/archived as grey).
  var events = [];
  readTable_('Subscriptions').forEach(function (s) {
    if (String(s.renewed_by_subscription_id)) return; // handled
    var e = String(s.expiry_date);
    if (e < range.from || e > range.to) return;
    var cust = custById[String(s.customer_id)] || {};
    var archived = toBool_(cust.is_archived);
    var d = decorateSubscription_(s, payMap);
    events.push({
      date: e,
      subscription_id: s.subscription_id,
      customer_id: s.customer_id,
      customer_name: cust.full_name || '',
      customer_code: cust.customer_code || '',
      phone_e164: cust.phone_e164 || '',
      plan_name: d.plan_name,
      expiry_date: e,
      days_remaining: daysFromToday_(e),
      outstanding: d.outstanding,
      amount_due: d.amount_due,
      payment_status: d.payment_status,
      activation_status: d.activation_status,
      color: colorForStatus_(s, archived, today),
    });
  });

  // Build day buckets across the visible range.
  var byDate = {};
  events.forEach(function (ev) {
    (byDate[ev.date] = byDate[ev.date] || []).push(ev);
  });
  var days = [];
  for (var cur = range.from; cur <= range.to; cur = addDaysISO_(cur, 1)) {
    var list = (byDate[cur] || []).slice().sort(function (a, b) { return String(a.customer_name).localeCompare(String(b.customer_name)); });
    days.push({
      date: cur,
      label: formatDisplayDate_(cur),
      weekday: weekdayName_(cur),
      is_today: cur === today,
      is_past: cur < today,
      count: list.length,
      events: list,
    });
  }

  var flat = events.slice().sort(function (a, b) {
    var d = String(a.date).localeCompare(String(b.date));
    if (d !== 0) return d;
    return String(a.customer_name).localeCompare(String(b.customer_name));
  });

  return {
    view: view,
    anchor: anchor,
    range: range,
    generated_on: today,
    days: days,
    list: flat,
    total_events: events.length,
  };
}
