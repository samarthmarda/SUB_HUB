/**
 * SUBSCRIPTION HUB — SubscriptionService.gs
 * The subscription engine. Every renewal creates a NEW subscription record linked
 * to the previous one; historical periods are never overwritten.
 *
 * Status is kept in two independent dimensions:
 *   activation_status (stored): Pending Approval / Approved / Rejected / Cancelled
 *   date_status      (derived): Upcoming / Active / Expired / Cancelled
 */

/** Date-derived status of a subscription (ignores approval). */
function subscriptionDateStatus_(sub) {
  if (String(sub.activation_status) === 'Cancelled') return 'Cancelled';
  var today = todayISO_();
  if (String(sub.expiry_date) < today) return 'Expired';
  if (String(sub.start_date) > today) return 'Upcoming';
  return 'Active';
}

/** True when approved and within its valid date range (counts toward active KPIs). */
function isApprovedActive_(sub) {
  if (String(sub.activation_status) !== 'Approved') return false;
  var today = todayISO_();
  return String(sub.start_date) <= today && String(sub.expiry_date) >= today;
}

/** Resolve the final expiry date: server-side calculation unless manually overridden. */
function resolveExpiry_(start, durationValue, durationUnit, providedExpiry, isManual) {
  if (isManual && providedExpiry && parseISO_(providedExpiry)) return providedExpiry;
  var calc = computeExpiryISO_(start, durationValue, durationUnit);
  return calc || providedExpiry || null;
}

/** Decides activation_status from payment + explicit approval intent. */
function resolveActivation_(amountDue, amountReceived, approveWithOutstanding, explicitStatus) {
  amountDue = parseAmount_(amountDue);
  amountReceived = parseAmount_(amountReceived);
  if (explicitStatus === 'Rejected' || explicitStatus === 'Cancelled') return explicitStatus;
  if (amountDue <= 0 || amountReceived >= amountDue) return 'Approved'; // fully paid -> auto-activate
  if (approveWithOutstanding) return 'Approved'; // explicit approval with outstanding balance
  return 'Pending Approval'; // never silently activate a partially paid subscription
}

function buildSubscriptionRow_(f) {
  return {
    subscription_id: f.subscription_id || uuid_(),
    customer_id: String(f.customer_id),
    plan_id: String(f.plan_id || ''),
    plan_name_snapshot: String(f.plan_name || ''),
    duration_value: Number(f.duration_value || 0),
    duration_unit: String(f.duration_unit || ''),
    start_date: f.start_date,
    expiry_date: f.expiry_date,
    expiry_is_manual: !!f.expiry_is_manual,
    amount_due: parseAmount_(f.amount_due),
    activation_status: f.activation_status || 'Pending Approval',
    previous_subscription_id: f.previous_subscription_id || '',
    renewed_by_subscription_id: f.renewed_by_subscription_id || '',
    approved_by: f.approved_by || '',
    approved_at: f.approved_at || '',
    cancelled_at: f.cancelled_at || '',
    cancel_reason: f.cancel_reason || '',
    created_at: nowISO_(),
    updated_at: nowISO_(),
  };
}

function finalizeApproval_(subRow, loginId) {
  if (subRow.activation_status === 'Approved' && !subRow.approved_by) {
    subRow.approved_by = loginId;
    subRow.approved_at = nowISO_();
  }
}

/** Enrich a raw subscription row with balances + statuses. */
function decorateSubscription_(sub, payMap) {
  payMap = payMap || aggregatePaymentsBySubscription_();
  var agg = payMap[String(sub.subscription_id)] || { paid: 0, refunds: 0, net: 0, count: 0 };
  var amountDue = parseAmount_(sub.amount_due);
  var netPaid = round2_(agg.net);
  return {
    subscription_id: sub.subscription_id,
    customer_id: sub.customer_id,
    plan_id: sub.plan_id,
    plan_name: sub.plan_name_snapshot,
    plan_name_snapshot: sub.plan_name_snapshot,
    duration_value: Number(sub.duration_value || 0),
    duration_unit: sub.duration_unit,
    start_date: sub.start_date,
    expiry_date: sub.expiry_date,
    expiry_is_manual: toBool_(sub.expiry_is_manual),
    amount_due: amountDue,
    activation_status: sub.activation_status,
    previous_subscription_id: sub.previous_subscription_id || '',
    renewed_by_subscription_id: sub.renewed_by_subscription_id || '',
    approved_by: sub.approved_by || '',
    approved_at: sub.approved_at || '',
    cancelled_at: sub.cancelled_at || '',
    cancel_reason: sub.cancel_reason || '',
    created_at: sub.created_at,
    updated_at: sub.updated_at,
    amount_paid: netPaid,
    net_paid: netPaid,
    outstanding: outstandingOf_(amountDue, netPaid),
    credit: creditOf_(amountDue, netPaid),
    payment_status: paymentStatusOf_(amountDue, netPaid),
    date_status: subscriptionDateStatus_(sub),
    is_active: isApprovedActive_(sub),
  };
}

/** All subscriptions for a customer, newest start first, decorated. */
function getSubscriptionsForCustomer_(customerId) {
  var subs = findMany_('Subscriptions', function (s) { return String(s.customer_id) === String(customerId); });
  var payMap = aggregatePaymentsBySubscription_();
  subs = subs.map(function (s) { return decorateSubscription_(s, payMap); });
  subs.sort(function (a, b) {
    var d = String(b.start_date).localeCompare(String(a.start_date));
    if (d !== 0) return d;
    return String(b.created_at).localeCompare(String(a.created_at));
  });
  return subs;
}

/** The subscription considered "current" for a customer (active preferred, else latest). */
function selectCurrentSubscription_(decoratedSubs) {
  if (!decoratedSubs || !decoratedSubs.length) return null;
  var active = decoratedSubs.filter(function (s) { return s.is_active; });
  if (active.length) {
    active.sort(function (a, b) { return String(b.start_date).localeCompare(String(a.start_date)); });
    return active[0];
  }
  var nonCancelled = decoratedSubs.filter(function (s) { return s.activation_status !== 'Cancelled'; });
  var pool = nonCancelled.length ? nonCancelled : decoratedSubs;
  pool.sort(function (a, b) { return String(b.expiry_date).localeCompare(String(a.expiry_date)); });
  return pool[0];
}

/** List subscriptions with optional filters. */
function listSubscriptions_(token, filters) {
  requireSession_(token);
  filters = filters || {};
  var subs = readTable_('Subscriptions');
  if (filters.customer_id) subs = subs.filter(function (s) { return String(s.customer_id) === String(filters.customer_id); });
  if (filters.activation_status) subs = subs.filter(function (s) { return String(s.activation_status) === String(filters.activation_status); });
  if (filters.status) {
    subs = subs.filter(function (s) { return subscriptionDateStatus_(s) === String(filters.status); });
  }
  var payMap = aggregatePaymentsBySubscription_();
  subs = subs.map(function (s) { return decorateSubscription_(s, payMap); });
  subs.sort(function (a, b) {
    var d = String(b.expiry_date).localeCompare(String(a.expiry_date));
    if (d !== 0) return d;
    return String(b.start_date).localeCompare(String(a.start_date));
  });
  var max = clamp_(filters.limit || 500, 1, 3000);
  return subs.slice(0, max);
}

// ---------------------------------------------------------------------------
// Create / renew / approve / cancel
// ---------------------------------------------------------------------------

/** Standalone "add subscription" for an existing customer. */
function createSubscription_(token, input) {
  var session = requireSession_(token);
  var v = validateSubscriptionInput_(input);
  if (!v.ok) throw new HubError_('VALIDATION', firstError_(v.errors), v.errors);

  var customerId = cleanStr_(input.customer_id);
  if (!customerId) throw new HubError_('VALIDATION', 'Customer is required.');
  var customer = findById_('Customers', 'customer_id', customerId);
  if (!customer) throw new HubError_('NOT_FOUND', 'Customer not found.');

  return withLock_(function () {
    var expiry = resolveExpiry_(v.data.start_date, v.data.duration_value, v.data.duration_unit, v.data.expiry_date, v.data.expiry_is_manual);
    if (!expiry) throw new HubError_('VALIDATION', 'Could not determine expiry date.');
    var activation = resolveActivation_(v.data.amount_due, parseAmount_(input.amount_received), toBool_(input.approve_with_outstanding), input.activation_status);
    var sub = buildSubscriptionRow_({
      customer_id: customerId,
      plan_id: v.data.plan_id,
      plan_name: v.data.plan_name || (findById_('SubscriptionPlans', 'plan_id', v.data.plan_id) || {}).plan_name || 'Custom',
      duration_value: v.data.duration_value,
      duration_unit: v.data.duration_unit,
      start_date: v.data.start_date,
      expiry_date: expiry,
      expiry_is_manual: v.data.expiry_is_manual,
      amount_due: v.data.amount_due,
      activation_status: activation,
    });
    finalizeApproval_(sub, session.loginId);
    appendRow_('Subscriptions', sub);

    if (parseAmount_(input.amount_received) > 0) {
      recordPaymentInternal_(session, {
        customer_id: customerId,
        subscription_id: sub.subscription_id,
        entry_type: 'PAYMENT',
        amount: parseAmount_(input.amount_received),
        payment_date: cleanStr_(input.payment_date) || todayISO_(),
        payment_method: cleanStr_(input.payment_method),
        transaction_reference: cleanStr_(input.transaction_reference),
        notes: cleanStr_(input.notes),
      });
    }
    audit_(token, 'Subscription', sub.subscription_id, 'CREATE', null, sub);
    invalidateDashboardCache_();
    return decorateSubscription_(sub);
  });
}

/**
 * Renew a subscription: create a NEW subscription linked to the previous one.
 * Early renewal (previous still valid) starts the day AFTER the previous expiry.
 * Expired renewal defaults the start to today. Overlap requires explicit approval.
 */
function renewSubscription_(token, input) {
  var session = requireSession_(token);
  var prevId = cleanStr_(input.previous_subscription_id);
  if (!prevId) throw new HubError_('VALIDATION', 'Previous subscription is required.');

  return withLock_(function () {
    var prev = findById_('Subscriptions', 'subscription_id', prevId);
    if (!prev) throw new HubError_('NOT_FOUND', 'Subscription to renew not found.');
    var customerId = String(prev.customer_id);

    // Determine new start date.
    var start = cleanStr_(input.start_date);
    if (!start || !parseISO_(start)) {
      var prevExpiry = String(prev.expiry_date);
      start = (prevExpiry && prevExpiry >= todayISO_()) ? addDaysISO_(prevExpiry, 1) : todayISO_();
    }

    var durationValue = Number(input.duration_value || 0);
    var durationUnit = String(input.duration_unit || '').toUpperCase();
    var isManual = toBool_(input.expiry_is_manual);
    var expiry = resolveExpiry_(start, durationValue, durationUnit, cleanStr_(input.expiry_date), isManual);
    if (!expiry || parseISO_(expiry).getTime() < parseISO_(start).getTime()) {
      throw new HubError_('VALIDATION', 'Expiry date must be on or after the start date.');
    }

    // Overlap guard: block unless explicitly allowed.
    var allowOverlap = toBool_(input.allow_overlap);
    if (!allowOverlap) {
      var overlaps = findMany_('Subscriptions', function (s) {
        return String(s.customer_id) === customerId &&
          String(s.subscription_id) !== prevId &&
          String(s.activation_status) !== 'Cancelled' &&
          String(s.start_date) <= expiry && String(s.expiry_date) >= start;
      });
      if (overlaps.length) {
        throw new HubError_('OVERLAP', 'This renewal overlaps an existing subscription. Confirm the exception to continue.', { overlapping: overlaps.length });
      }
    }

    var amountDue = parseAmount_(input.amount_due);
    var amountReceived = parseAmount_(input.amount_received);
    var activation = resolveActivation_(amountDue, amountReceived, toBool_(input.approve_with_outstanding), input.activation_status);

    var sub = buildSubscriptionRow_({
      customer_id: customerId,
      plan_id: cleanStr_(input.plan_id) || String(prev.plan_id),
      plan_name: cleanStr_(input.plan_name) || String(prev.plan_name_snapshot) || 'Custom',
      duration_value: durationValue,
      duration_unit: durationUnit,
      start_date: start,
      expiry_date: expiry,
      expiry_is_manual: isManual,
      amount_due: amountDue,
      activation_status: activation,
      previous_subscription_id: prevId,
    });
    finalizeApproval_(sub, session.loginId);
    appendRow_('Subscriptions', sub);

    // Link previous -> renewed_by.
    updateRowById_('Subscriptions', 'subscription_id', prevId, {
      renewed_by_subscription_id: sub.subscription_id,
      updated_at: nowISO_(),
    });

    if (amountReceived > 0) {
      recordPaymentInternal_(session, {
        customer_id: customerId,
        subscription_id: sub.subscription_id,
        entry_type: 'PAYMENT',
        amount: amountReceived,
        payment_date: cleanStr_(input.payment_date) || todayISO_(),
        payment_method: cleanStr_(input.payment_method),
        transaction_reference: cleanStr_(input.transaction_reference),
        notes: 'Renewal payment',
      });
    }

    audit_(token, 'Subscription', sub.subscription_id, 'RENEW', { previous: prevId }, sub);
    invalidateDashboardCache_();
    return decorateSubscription_(sub);
  });
}

function approveSubscription_(token, subscriptionId) {
  var session = requireSession_(token);
  if (!cleanStr_(subscriptionId)) throw new HubError_('VALIDATION', 'Subscription ID is required.');
  return withLock_(function () {
    var sub = findById_('Subscriptions', 'subscription_id', subscriptionId);
    if (!sub) throw new HubError_('NOT_FOUND', 'Subscription not found.');
    if (String(sub.activation_status) === 'Cancelled') {
      throw new HubError_('INVALID_STATE', 'Cannot approve a cancelled subscription.');
    }
    var patch = {
      activation_status: 'Approved',
      approved_by: session.loginId,
      approved_at: nowISO_(),
      updated_at: nowISO_(),
    };
    updateRowById_('Subscriptions', 'subscription_id', subscriptionId, patch);
    audit_(token, 'Subscription', subscriptionId, 'APPROVE', { activation_status: sub.activation_status }, patch);
    invalidateDashboardCache_();
    return decorateSubscription_(findById_('Subscriptions', 'subscription_id', subscriptionId));
  });
}

function cancelSubscription_(token, subscriptionId, reason) {
  requireSession_(token);
  if (!cleanStr_(subscriptionId)) throw new HubError_('VALIDATION', 'Subscription ID is required.');
  return withLock_(function () {
    var sub = findById_('Subscriptions', 'subscription_id', subscriptionId);
    if (!sub) throw new HubError_('NOT_FOUND', 'Subscription not found.');
    var patch = {
      activation_status: 'Cancelled',
      cancelled_at: nowISO_(),
      cancel_reason: cleanStr_(reason).slice(0, 500),
      updated_at: nowISO_(),
    };
    updateRowById_('Subscriptions', 'subscription_id', subscriptionId, patch);
    audit_(token, 'Subscription', subscriptionId, 'CANCEL', { activation_status: sub.activation_status }, patch);
    invalidateDashboardCache_();
    return decorateSubscription_(findById_('Subscriptions', 'subscription_id', subscriptionId));
  });
}

/** Internal payment recorder used by create/renew (already inside a lock + session). */
function recordPaymentInternal_(session, p) {
  var payment = {
    payment_id: uuid_(),
    customer_id: String(p.customer_id),
    subscription_id: String(p.subscription_id),
    entry_type: p.entry_type || 'PAYMENT',
    amount: parseAmount_(p.amount),
    payment_date: p.payment_date || todayISO_(),
    payment_method: p.payment_method || '',
    transaction_reference: p.transaction_reference || '',
    notes: p.notes || '',
    created_at: nowISO_(),
    created_by: session ? session.loginId : 'system',
  };
  appendRow_('Payments', payment);
  return payment;
}
