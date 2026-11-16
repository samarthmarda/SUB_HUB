/**
 * SUBSCRIPTION HUB — PaymentService.gs
 * Append-only payment ledger. Payments are never overwritten; corrections are made
 * by recording a REFUND and, if needed, a replacement PAYMENT.
 *
 *   Net Paid        = Σ PAYMENT − Σ REFUND
 *   Outstanding     = max(0, AmountDue − NetPaid)
 *   Credit          = max(0, NetPaid − AmountDue)
 */

/** Aggregate payments grouped by subscription_id: { subId: {paid, refunds, net, count} }. */
function aggregatePaymentsBySubscription_() {
  var rows = readTable_('Payments');
  var map = {};
  rows.forEach(function (p) {
    var sid = String(p.subscription_id);
    if (!map[sid]) map[sid] = { paid: 0, refunds: 0, net: 0, count: 0 };
    var amt = parseAmount_(p.amount);
    var type = String(p.entry_type || '').toUpperCase();
    if (type === 'REFUND') {
      map[sid].refunds += amt;
      map[sid].net -= amt;
    } else {
      map[sid].paid += amt;
      map[sid].net += amt;
    }
    map[sid].count += 1;
  });
  Object.keys(map).forEach(function (k) {
    map[k].paid = round2_(map[k].paid);
    map[k].refunds = round2_(map[k].refunds);
    map[k].net = round2_(map[k].net);
  });
  return map;
}

function netPaidForSubscription_(subscriptionId) {
  var map = aggregatePaymentsBySubscription_();
  var a = map[String(subscriptionId)];
  return a ? a.net : 0;
}

/** Payment status label for a subscription given its amount due and net paid. */
function paymentStatusOf_(amountDue, netPaid) {
  amountDue = parseAmount_(amountDue);
  netPaid = parseAmount_(netPaid);
  if (amountDue <= 0) return 'Paid';
  if (netPaid >= amountDue) return netPaid > amountDue ? 'Credit Balance' : 'Paid';
  if (netPaid > 0) return 'Partially Paid';
  return 'Unpaid';
}

function outstandingOf_(amountDue, netPaid) {
  return round2_(Math.max(0, parseAmount_(amountDue) - parseAmount_(netPaid)));
}

function creditOf_(amountDue, netPaid) {
  return round2_(Math.max(0, parseAmount_(netPaid) - parseAmount_(amountDue)));
}

/** List payments with optional filters. Newest first. */
function listPayments_(token, filters) {
  requireSession_(token);
  filters = filters || {};
  var rows = readTable_('Payments');
  rows.forEach(function (p) { p.amount = parseAmount_(p.amount); });

  if (filters.customer_id) rows = rows.filter(function (p) { return String(p.customer_id) === String(filters.customer_id); });
  if (filters.subscription_id) rows = rows.filter(function (p) { return String(p.subscription_id) === String(filters.subscription_id); });
  if (filters.entry_type) rows = rows.filter(function (p) { return String(p.entry_type).toUpperCase() === String(filters.entry_type).toUpperCase(); });
  if (filters.payment_method) rows = rows.filter(function (p) { return String(p.payment_method) === String(filters.payment_method); });
  if (filters.from) rows = rows.filter(function (p) { return String(p.payment_date) >= String(filters.from); });
  if (filters.to) rows = rows.filter(function (p) { return String(p.payment_date) <= String(filters.to); });

  rows.sort(function (a, b) {
    var d = String(b.payment_date).localeCompare(String(a.payment_date));
    if (d !== 0) return d;
    return String(b.created_at).localeCompare(String(a.created_at));
  });

  var max = clamp_(filters.limit || 300, 1, 2000);
  return rows.slice(0, max);
}

/** Record a PAYMENT or REFUND against a specific subscription. */
function recordPayment_(token, input) {
  var session = requireSession_(token);
  var v = validatePaymentInput_(input);
  if (!v.ok) throw new HubError_('VALIDATION', firstError_(v.errors), v.errors);

  var subId = cleanStr_(input.subscription_id);
  if (!subId) throw new HubError_('VALIDATION', 'A subscription is required to record a payment.');

  return withLock_(function () {
    var sub = findById_('Subscriptions', 'subscription_id', subId);
    if (!sub) throw new HubError_('NOT_FOUND', 'Subscription not found.');
    if (String(sub.activation_status) === 'Cancelled') {
      throw new HubError_('INVALID_STATE', 'Cannot record a payment on a cancelled subscription.');
    }

    if (v.data.entry_type === 'REFUND') {
      var net = netPaidForSubscription_(subId);
      if (v.data.amount > net) {
        throw new HubError_('VALIDATION', 'Refund amount cannot exceed the net amount paid (' + net + ').');
      }
    }

    var payment = {
      payment_id: uuid_(),
      customer_id: cleanStr_(input.customer_id) || String(sub.customer_id),
      subscription_id: subId,
      entry_type: v.data.entry_type,
      amount: v.data.amount,
      payment_date: v.data.payment_date,
      payment_method: v.data.payment_method,
      transaction_reference: v.data.transaction_reference,
      notes: v.data.notes,
      created_at: nowISO_(),
      created_by: session.loginId,
    };
    appendRow_('Payments', payment);
    audit_(token, 'Payment', payment.payment_id, v.data.entry_type, null, payment);
    invalidateDashboardCache_();
    return payment;
  });
}

/** All payments for one customer (across all their subscriptions). */
function getCustomerPayments_(token, customerId) {
  requireSession_(token);
  var rows = readTable_('Payments').filter(function (p) { return String(p.customer_id) === String(customerId); });
  rows.forEach(function (p) { p.amount = parseAmount_(p.amount); });
  rows.sort(function (a, b) {
    var d = String(b.payment_date).localeCompare(String(a.payment_date));
    if (d !== 0) return d;
    return String(b.created_at).localeCompare(String(a.created_at));
  });
  return rows;
}
