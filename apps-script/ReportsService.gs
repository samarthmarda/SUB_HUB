/**
 * SUBSCRIPTION HUB — ReportsService.gs
 * Revenue / subscription / outstanding reports, all derived from real records.
 * Provides CSV export. No fabricated statistics.
 */

function getReports_(token, range) {
  requireSession_(token);
  var valid = ['today', '7d', '30d', 'mtd', 'all'];
  range = valid.indexOf(range) >= 0 ? range : '30d';
  var today = todayISO_();
  var customers = readTable_('Customers');
  var subs = readTable_('Subscriptions');
  var payments = readTable_('Payments');
  payments.forEach(function (p) { p.amount = parseAmount_(p.amount); });

  var custArchived = {};
  customers.forEach(function (c) { custArchived[String(c.customer_id)] = toBool_(c.is_archived); });

  var netBySub = {};
  payments.forEach(function (p) {
    var sid = String(p.subscription_id);
    if (!netBySub[sid]) netBySub[sid] = 0;
    netBySub[sid] += (String(p.entry_type).toUpperCase() === 'REFUND' ? -p.amount : p.amount);
  });
  function netPaid(sid) { return round2_(netBySub[String(sid)] || 0); }

  var thisMonth = monthKey_(today);
  var lastMonth = startOfMonthISO_(addDurationISO_(startOfMonthISO_(today), -1, 'MONTH')).slice(0, 7);

  // --- Revenue ---
  var revenueToday = 0, revenueThisMonth = 0, revenueLastMonth = 0, lifetime = 0;
  var byMethod = {};
  payments.forEach(function (p) {
    var signed = (String(p.entry_type).toUpperCase() === 'REFUND' ? -p.amount : p.amount);
    lifetime += signed;
    var pd = String(p.payment_date);
    if (pd === today) revenueToday += signed;
    var mk = monthKey_(pd);
    if (mk === thisMonth) revenueThisMonth += signed;
    if (mk === lastMonth) revenueLastMonth += signed;
    var method = p.payment_method || 'Unspecified';
    byMethod[method] = round2_((byMethod[method] || 0) + signed);
  });

  // Monthly revenue trend (12 months)
  var revenueByMonth = {};
  payments.forEach(function (p) {
    var mk = monthKey_(p.payment_date);
    if (!mk) return;
    revenueByMonth[mk] = (revenueByMonth[mk] || 0) + (String(p.entry_type).toUpperCase() === 'REFUND' ? -p.amount : p.amount);
  });
  var revenueTrend = [];
  var m0 = startOfMonthISO_(today);
  for (var i = 11; i >= 0; i--) {
    var mk = startOfMonthISO_(addDurationISO_(m0, -i, 'MONTH')).slice(0, 7);
    var parts = mk.split('-');
    revenueTrend.push({ month: mk, label: MONTH_NAMES[Number(parts[1]) - 1] + ' ' + parts[0], revenue: round2_(revenueByMonth[mk] || 0) });
  }

  // --- Subscriptions ---
  var activeSubs = 0, upcomingRenewals = 0, expiredSubs = 0, renewalsCompleted = 0;
  var subCountByCustomer = {};
  subs.forEach(function (s) {
    var activation = String(s.activation_status);
    var renewed = !!String(s.renewed_by_subscription_id);
    if (String(s.previous_subscription_id)) renewalsCompleted += 1;
    subCountByCustomer[String(s.customer_id)] = (subCountByCustomer[String(s.customer_id)] || 0) + 1;
    if (activation === 'Approved' && String(s.start_date) <= today && String(s.expiry_date) >= today) activeSubs += 1;
    if (activation !== 'Cancelled' && !renewed && String(s.expiry_date) >= today) upcomingRenewals += 1;
    if (activation !== 'Cancelled' && !renewed && String(s.expiry_date) < today) expiredSubs += 1;
  });
  var newCustomers = customers.filter(function (c) { return !custArchived[String(c.customer_id)] && String(c.joined_date) === today; }).length;
  var repeatCustomers = 0;
  Object.keys(subCountByCustomer).forEach(function (k) { if (subCountByCustomer[k] >= 2) repeatCustomers += 1; });

  // --- Outstanding ---
  var partiallyPaid = 0, unpaid = 0, outstandingTotal = 0, overdueCount = 0, overdueTotal = 0;
  subs.forEach(function (s) {
    if (String(s.activation_status) === 'Cancelled') return;
    var due = parseAmount_(s.amount_due);
    var out = outstandingOf_(due, netPaid(s.subscription_id));
    outstandingTotal += out;
    var st = paymentStatusOf_(due, netPaid(s.subscription_id));
    if (st === 'Partially Paid') partiallyPaid += 1;
    if (st === 'Unpaid') unpaid += 1;
    if (out > 0 && String(s.expiry_date) < today) { overdueCount += 1; overdueTotal += out; }
  });

  return {
    generated_on: today,
    range: range,
    currency_symbol: getSettingCached_('currency_symbol') || '₹',
    revenue: {
      today: round2_(revenueToday),
      this_month: round2_(revenueThisMonth),
      last_month: round2_(revenueLastMonth),
      lifetime_collections: round2_(lifetime),
      by_method: byMethod,
      trend: revenueTrend,
    },
    subscriptions: {
      active: activeSubs,
      new_customers_today: newCustomers,
      renewals_completed: renewalsCompleted,
      upcoming_renewals: upcomingRenewals,
      expired: expiredSubs,
      repeat_customers: repeatCustomers,
    },
    outstanding: {
      partially_paid: partiallyPaid,
      unpaid: unpaid,
      outstanding_total: round2_(outstandingTotal),
      overdue_count: overdueCount,
      overdue_total: round2_(overdueTotal),
    },
  };
}

function csvEscape_(v) {
  var s = (v === undefined || v === null) ? '' : String(v);
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function toCsv_(headers, rows) {
  var lines = [headers.map(csvEscape_).join(',')];
  rows.forEach(function (r) { lines.push(r.map(csvEscape_).join(',')); });
  return lines.join('\n');
}

/** Build CSV exports for customers / renewals / payments / outstanding. */
function exportReportCsv_(token, type) {
  requireSession_(token);
  type = cleanStr_(type) || 'customers';
  var today = todayISO_();
  var filename, csv;

  if (type === 'payments') {
    var payments = listPayments_(token, { limit: 5000 });
    filename = 'subscription-hub-payments-' + today + '.csv';
    csv = toCsv_(
      ['payment_id', 'date', 'customer_id', 'subscription_id', 'type', 'amount', 'method', 'reference', 'notes'],
      payments.map(function (p) {
        return [p.payment_id, p.payment_date, p.customer_id, p.subscription_id, p.entry_type, p.amount, p.payment_method, p.transaction_reference, p.notes];
      })
    );
  } else if (type === 'renewals') {
    var r = getRenewals_(token, 'upcoming');
    filename = 'subscription-hub-renewals-' + today + '.csv';
    csv = toCsv_(
      ['customer_code', 'customer_name', 'phone', 'plan', 'expiry_date', 'days_remaining', 'amount', 'outstanding', 'status'],
      r.items.map(function (i) {
        return [i.customer_code, i.customer_name, i.phone_e164, i.plan_name, i.expiry_date, i.days_remaining, i.subscription_amount, i.outstanding, i.reminder_status];
      })
    );
  } else if (type === 'outstanding') {
    var subs = listSubscriptions_(token, { limit: 5000 }).filter(function (s) { return s.outstanding > 0 && s.activation_status !== 'Cancelled'; });
    var custById = {};
    readTable_('Customers').forEach(function (c) { custById[String(c.customer_id)] = c; });
    filename = 'subscription-hub-outstanding-' + today + '.csv';
    csv = toCsv_(
      ['customer_code', 'customer_name', 'phone', 'plan', 'expiry_date', 'amount_due', 'paid', 'outstanding', 'payment_status'],
      subs.map(function (s) {
        var c = custById[String(s.customer_id)] || {};
        return [c.customer_code || '', c.full_name || '', c.phone_e164 || '', s.plan_name, s.expiry_date, s.amount_due, s.amount_paid, s.outstanding, s.payment_status];
      })
    );
  } else { // customers
    var list = listCustomers_(token, { include_archived: true, page_size: 2000 });
    filename = 'subscription-hub-customers-' + today + '.csv';
    csv = toCsv_(
      ['customer_code', 'name', 'phone', 'joined_date', 'plan', 'start', 'expiry', 'amount', 'paid', 'outstanding', 'status', 'archived'],
      list.items.map(function (c) {
        return [c.customer_code, c.full_name, c.phone_e164, c.joined_date, c.current_plan, c.subscription_start, c.expiry_date, c.subscription_amount, c.amount_paid, c.outstanding, c.date_status, c.is_archived];
      })
    );
  }
  return { filename: filename, csv: csv };
}
