/**
 * SUBSCRIPTION HUB — DashboardService.gs
 * Dashboard metrics are calculated from real records (never fabricated) and cached
 * briefly in CacheService. Caches are invalidated after any write.
 */

function invalidateDashboardCache_() {
  try {
    var cache = CacheService.getScriptCache();
    ['today', '7d', '30d', 'mtd'].forEach(function (r) { cache.remove('HUB_DASH_' + r); });
  } catch (e) { /* cache optional */ }
}

function rangeBounds_(range, today) {
  if (range === 'today') return { from: today, to: today };
  if (range === '7d') return { from: addDaysISO_(today, -6), to: today };
  if (range === 'mtd') return { from: startOfMonthISO_(today), to: today };
  return { from: addDaysISO_(today, -29), to: today }; // 30d
}

function getDashboard_(token, range) {
  var session = requireSession_(token);
  // Idempotent catch-up for missed reminder-trigger runs (never block the UI on lock).
  try { generateRemindersInternal_(); } catch (e) { /* busy — skip this cycle */ }

  var valid = ['today', '7d', '30d', 'mtd'];
  range = valid.indexOf(range) >= 0 ? range : '30d';

  var cache = CacheService.getScriptCache();
  var key = 'HUB_DASH_' + range;
  var cached = cache.get(key);
  if (cached) {
    var p = safeJsonParse_(cached, null);
    if (p) { p.from_cache = true; p.synced_at = nowISO_(); return p; }
  }

  var payload = computeDashboard_(range, session);
  payload.from_cache = false;
  payload.synced_at = nowISO_();
  try { cache.put(key, objToJson_(payload), 60); } catch (e) { /* cache optional */ }
  return payload;
}

function computeDashboard_(range, session) {
  var today = todayISO_();
  var customers = readTable_('Customers');
  var subs = readTable_('Subscriptions');
  var payments = readTable_('Payments');
  payments.forEach(function (p) { p.amount = parseAmount_(p.amount); });

  var custArchived = {};
  customers.forEach(function (c) { custArchived[String(c.customer_id)] = toBool_(c.is_archived); });

  // Net paid per subscription (single pass).
  var netBySub = {};
  payments.forEach(function (p) {
    var sid = String(p.subscription_id);
    if (!netBySub[sid]) netBySub[sid] = 0;
    netBySub[sid] += (String(p.entry_type).toUpperCase() === 'REFUND' ? -p.amount : p.amount);
  });

  function netPaid(sid) { return round2_(netBySub[String(sid)] || 0); }

  var thisMonth = monthKey_(today);
  var in3 = addDaysISO_(today, 3);
  var in7 = addDaysISO_(today, 7);

  // --- KPI accumulators ---
  var activeSubs = 0;
  var activeMembers = {};
  var revenueMtd = 0;
  var outstandingTotal = 0;
  var expiredSubs = 0;
  var expiring7Customers = {};
  var dist = { 'Paid': 0, 'Partially Paid': 0, 'Unpaid': 0, 'Credit Balance': 0 };
  var actionRenewToday = 0, actionRenew3 = 0, actionRenew7 = 0;
  var actionExpiredCustomers = {};
  var pendingApprovals = 0;
  var pendingBalances = 0;

  subs.forEach(function (s) {
    var activation = String(s.activation_status);
    var renewed = !!String(s.renewed_by_subscription_id);
    var expiry = String(s.expiry_date);
    var start = String(s.start_date);
    var archived = custArchived[String(s.customer_id)];

    if (activation === 'Approved' && start <= today && expiry >= today) {
      activeSubs += 1;
      activeMembers[String(s.customer_id)] = 1;
    }
    if (activation === 'Pending Approval') pendingApprovals += 1;

    if (activation !== 'Cancelled') {
      var due = parseAmount_(s.amount_due);
      var out = outstandingOf_(due, netPaid(s.subscription_id));
      outstandingTotal += out;
      if (out > 0) pendingBalances += 1;
      var st = paymentStatusOf_(due, netPaid(s.subscription_id));
      dist[st] = (dist[st] || 0) + 1;

      if (!renewed && expiry >= today && expiry <= in7 && activation === 'Approved' && !archived) {
        expiring7Customers[String(s.customer_id)] = 1;
      }
      if (!renewed) {
        if (expiry < today && !archived) actionExpiredCustomers[String(s.customer_id)] = 1;
        if (expiry === today && !archived) actionRenewToday += 1;
        if (expiry >= today && expiry <= in3 && !archived) actionRenew3 += 1;
        if (expiry >= today && expiry <= in7 && !archived) actionRenew7 += 1;
        if (expiry < today) expiredSubs += 1;
      }
    }
  });

  // Revenue MTD (payment dates in current month).
  payments.forEach(function (p) {
    if (monthKey_(p.payment_date) === thisMonth) {
      revenueMtd += (String(p.entry_type).toUpperCase() === 'REFUND' ? -p.amount : p.amount);
    }
  });
  revenueMtd = round2_(revenueMtd);

  // Range-based figures.
  var bounds = rangeBounds_(range, today);
  var revenueInRange = 0;
  payments.forEach(function (p) {
    if (String(p.payment_date) >= bounds.from && String(p.payment_date) <= bounds.to) {
      revenueInRange += (String(p.entry_type).toUpperCase() === 'REFUND' ? -p.amount : p.amount);
    }
  });
  revenueInRange = round2_(revenueInRange);
  var newCustomersInRange = customers.filter(function (c) {
    return !custArchived[String(c.customer_id)] && String(c.joined_date) >= bounds.from && String(c.joined_date) <= bounds.to;
  }).length;

  // Revenue trend — last 6 months by payment date.
  var revenueByMonth = {};
  payments.forEach(function (p) {
    var mk = monthKey_(p.payment_date);
    if (!mk) return;
    revenueByMonth[mk] = (revenueByMonth[mk] || 0) + (String(p.entry_type).toUpperCase() === 'REFUND' ? -p.amount : p.amount);
  });
  var revenueTrend = [];
  var m0 = startOfMonthISO_(today);
  for (var i = 5; i >= 0; i--) {
    var mk = startOfMonthISO_(addDurationISO_(m0, -i, 'MONTH')).slice(0, 7);
    var parts = mk.split('-');
    revenueTrend.push({
      month: mk,
      label: MONTH_NAMES[Number(parts[1]) - 1] + ' ' + parts[0],
      revenue: round2_(revenueByMonth[mk] || 0),
    });
  }

  // Renewal forecast — next 30 days (daily), expected expiries.
  var forecastDaily = [];
  var forecastTotal = 0;
  for (var d = 0; d < 30; d++) {
    var day = addDaysISO_(today, d);
    var count = 0;
    subs.forEach(function (s) {
      if (String(s.activation_status) !== 'Cancelled' && !String(s.renewed_by_subscription_id) && String(s.expiry_date) === day) {
        count += 1;
      }
    });
    forecastTotal += count;
    forecastDaily.push({ date: day, label: formatDisplayDate_(day), weekday: weekdayName_(day), count: count });
  }

  // Follow-ups pending + recent activity.
  var reminders = readTable_('ReminderLogs');
  var followupsPending = reminders.filter(function (r) { return String(r.followup_status) === 'Pending'; }).length;
  var activity = recentAuditRows_(12);

  var capacity = getCustomerCapacity_();

  return {
    generated_on: today,
    range: range,
    range_bounds: bounds,
    greeting_name: (session && session.loginId) ? session.loginId : 'there',
    business_name: getSettingCached_('business_name') || 'SUBSCRIPTION HUB',
    currency_symbol: getSettingCached_('currency_symbol') || '₹',
    setup_complete: PROPS_.getProperty('SETUP_COMPLETED') === 'true',
    kpis: {
      active_members: Object.keys(activeMembers).length,
      active_subscriptions: activeSubs,
      revenue_mtd: revenueMtd,
      outstanding_balance: round2_(outstandingTotal),
      expiring_7_days: Object.keys(expiring7Customers).length,
      expired_subscriptions: expiredSubs,
      revenue_in_range: revenueInRange,
      new_customers_in_range: newCustomersInRange,
      total_customers: customers.filter(function (c) { return !custArchived[String(c.customer_id)]; }).length,
    },
    capacity: capacity,
    analytics: {
      renewal_forecast: { daily: forecastDaily, total: forecastTotal },
      revenue_trend: revenueTrend,
      payment_distribution: dist,
    },
    action_queue: {
      renewals_today: actionRenewToday,
      renewals_3days: actionRenew3,
      renewals_7days: actionRenew7,
      expired_customers: Object.keys(actionExpiredCustomers).length,
      pending_approvals: pendingApprovals,
      pending_payment_balances: pendingBalances,
      followups_pending: followupsPending,
    },
    recent_activity: activity,
  };
}
