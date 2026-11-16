/**
 * SUBSCRIPTION HUB — CustomerService.gs
 * Customer directory, capacity management, the atomic New-Customer flow
 * (customer + subscription + payment + activation in one locked operation),
 * and the Customer 360 profile.
 */

var DEFAULT_CUSTOMER_CAPACITY = 500;

function getCustomerCapacity_() {
  var cap = Number(getSettingCached_('customer_capacity') || DEFAULT_CUSTOMER_CAPACITY);
  if (!isFinite(cap) || cap <= 0) cap = DEFAULT_CUSTOMER_CAPACITY;
  var active = countActiveRows_('Customers', 'is_archived');
  return {
    active: active,
    capacity: cap,
    remaining: Math.max(0, cap - active),
    atLimit: active >= cap,
  };
}

function nextCustomerCode_() {
  var seq = Number(PROPS_.getProperty('CUSTOMER_CODE_SEQ') || 0);
  var rows = readTable_('Customers');
  var maxExisting = 0;
  rows.forEach(function (r) {
    var m = /(\d+)\s*$/.exec(String(r.customer_code || ''));
    if (m) maxExisting = Math.max(maxExisting, Number(m[1]));
  });
  seq = Math.max(seq, maxExisting) + 1;
  PROPS_.setProperty('CUSTOMER_CODE_SEQ', String(seq));
  return formatCustomerCode_(seq);
}

/** Decorate a customer with its current subscription summary + balances. */
function decorateCustomer_(cust, subsByCustomer, payMap) {
  var subs = subsByCustomer[String(cust.customer_id)] || [];
  var decorated = subs.map(function (s) { return decorateSubscription_(s, payMap); });
  var current = selectCurrentSubscription_(decorated);
  var archived = toBool_(cust.is_archived);
  return {
    customer_id: cust.customer_id,
    customer_code: cust.customer_code,
    full_name: cust.full_name,
    phone_e164: cust.phone_e164,
    joined_date: cust.joined_date,
    notes: cust.notes || '',
    is_archived: archived,
    current_plan: current ? current.plan_name : '',
    subscription_start: current ? current.start_date : '',
    expiry_date: current ? current.expiry_date : '',
    subscription_amount: current ? current.amount_due : 0,
    amount_paid: current ? current.amount_paid : 0,
    outstanding: current ? current.outstanding : 0,
    payment_status: current ? current.payment_status : '',
    activation_status: current ? current.activation_status : '',
    date_status: current ? current.date_status : (archived ? 'Archived' : 'No Subscription'),
    days_to_expiry: current ? daysFromToday_(current.expiry_date) : null,
  };
}

function groupSubsByCustomer_() {
  var subs = readTable_('Subscriptions');
  var map = {};
  subs.forEach(function (s) {
    var k = String(s.customer_id);
    if (!map[k]) map[k] = [];
    map[k].push(s);
  });
  return map;
}

/** Searchable / filterable / sortable / paginated customer directory. */
function listCustomers_(token, params) {
  requireSession_(token);
  params = params || {};
  var customers = readTable_('Customers');
  var subsByCustomer = groupSubsByCustomer_();
  var payMap = aggregatePaymentsBySubscription_();
  var today = todayISO_();
  var in7 = addDaysISO_(today, 7);

  var items = customers.map(function (c) { return decorateCustomer_(c, subsByCustomer, payMap); });

  // Search
  var q = cleanStr_(params.search).toLowerCase();
  if (q) {
    items = items.filter(function (c) {
      return String(c.full_name).toLowerCase().indexOf(q) !== -1 ||
        String(c.phone_e164).replace(/\D+/g, '').indexOf(q.replace(/\D+/g, '')) !== -1 ||
        String(c.customer_id).toLowerCase().indexOf(q) !== -1 ||
        String(c.customer_code).toLowerCase().indexOf(q) !== -1;
    });
  }

  // Filters
  if (params.include_archived !== true) items = items.filter(function (c) { return !c.is_archived; });
  if (params.status) items = items.filter(function (c) { return c.date_status === params.status; });
  if (params.expiring_within_days) {
    var limit = addDaysISO_(today, Number(params.expiring_within_days));
    items = items.filter(function (c) { return c.expiry_date && c.expiry_date >= today && c.expiry_date <= limit; });
  }
  if (params.has_outstanding === true) items = items.filter(function (c) { return c.outstanding > 0; });
  if (params.unpaid_only === true) items = items.filter(function (c) { return c.payment_status === 'Unpaid' || c.payment_status === 'Partially Paid'; });

  // Sort
  var sortBy = params.sort_by || 'expiry_date';
  var sortDir = params.sort_dir === 'asc' ? 1 : -1;
  items.sort(function (a, b) {
    var av, bv;
    if (sortBy === 'name') { av = String(a.full_name).toLowerCase(); bv = String(b.full_name).toLowerCase(); }
    else if (sortBy === 'joined_date') { av = String(a.joined_date); bv = String(b.joined_date); }
    else if (sortBy === 'outstanding') { av = a.outstanding; bv = b.outstanding; }
    else { av = String(a.expiry_date || '9999-99-99'); bv = String(b.expiry_date || '9999-99-99'); }
    if (av < bv) return -1 * sortDir;
    if (av > bv) return 1 * sortDir;
    return 0;
  });

  // Pagination
  var page = Math.max(1, Number(params.page || 1));
  var pageSize = clamp_(Number(params.page_size || 25), 5, 200);
  var total = items.length;
  var start = (page - 1) * pageSize;
  var pageItems = items.slice(start, start + pageSize);

  return {
    items: pageItems,
    total: total,
    page: page,
    page_size: pageSize,
    capacity: getCustomerCapacity_(),
  };
}

/** Duplicate-phone detection used by the New Customer modal. */
function checkDuplicatePhone_(token, phone) {
  requireSession_(token);
  var e164 = normalizePhoneE164_(phone, getSettingCached_('default_country_code'));
  if (!e164) return { exists: false };
  var dup = findMany_('Customers', function (c) { return normalizePhoneE164_(c.phone_e164, '91') === e164; });
  if (dup.length) {
    return {
      exists: true,
      customer_id: dup[0].customer_id,
      full_name: dup[0].full_name,
      is_archived: toBool_(dup[0].is_archived),
    };
  }
  return { exists: false };
}

/**
 * Atomic New-Customer flow. Creates the customer, the initial subscription,
 * and any received payment, deciding activation per payment/approval rules.
 */
function createCustomer_(token, input) {
  var session = requireSession_(token);
  var custV = validateCustomerInput_(input, getSettingCached_('default_country_code'));
  var subV = validateSubscriptionInput_(input);
  var payV = validatePaymentInput_({
    amount: input.amount_received,
    payment_date: input.payment_date,
    payment_method: input.payment_method,
    transaction_reference: input.transaction_reference,
    notes: input.payment_notes,
  });
  if (!custV.ok || !subV.ok || !payV.ok) {
    var errors = {};
    [custV, subV, payV].forEach(function (v) { Object.keys(v.errors).forEach(function (k) { errors[k] = v.errors[k]; }); });
    throw new HubError_('VALIDATION', firstError_(errors), errors);
  }

  return withLock_(function () {
    var cap = getCustomerCapacity_();
    if (cap.atLimit) {
      throw new HubError_('CAPACITY_REACHED',
        'Customer limit reached (' + cap.active + '/' + cap.capacity + '). Archive inactive customers to add more.',
        cap);
    }

    var e164 = custV.data.phone_e164;
    var dup = findMany_('Customers', function (c) { return normalizePhoneE164_(c.phone_e164, '91') === e164; });
    if (dup.length) {
      throw new HubError_('DUPLICATE_PHONE', 'A customer with this WhatsApp number already exists.', {
        existingCustomerId: dup[0].customer_id,
        existingName: dup[0].full_name,
      });
    }

    var amountDue = subV.data.amount_due;
    var amountReceived = payV.ok ? payV.data.amount : 0;
    var expiry = resolveExpiry_(subV.data.start_date, subV.data.duration_value, subV.data.duration_unit, subV.data.expiry_date, subV.data.expiry_is_manual);
    if (!expiry) throw new HubError_('VALIDATION', 'Could not determine the expiry date.', { expiry_date: 'Invalid duration.' });

    // 1) Customer
    var customer = {
      customer_id: uuid_(),
      customer_code: nextCustomerCode_(),
      full_name: custV.data.full_name,
      phone_e164: e164,
      joined_date: custV.data.joined_date,
      notes: custV.data.notes,
      is_archived: false,
      created_at: nowISO_(),
      updated_at: nowISO_(),
    };
    appendRow_('Customers', customer);

    // 2) Subscription
    var activation = resolveActivation_(amountDue, amountReceived, toBool_(input.approve_with_outstanding), null);
    var sub = buildSubscriptionRow_({
      customer_id: customer.customer_id,
      plan_id: subV.data.plan_id,
      plan_name: subV.data.plan_name || (findById_('SubscriptionPlans', 'plan_id', subV.data.plan_id) || {}).plan_name || 'Custom',
      duration_value: subV.data.duration_value,
      duration_unit: subV.data.duration_unit,
      start_date: subV.data.start_date,
      expiry_date: expiry,
      expiry_is_manual: subV.data.expiry_is_manual,
      amount_due: amountDue,
      activation_status: activation,
    });
    finalizeApproval_(sub, session.loginId);
    appendRow_('Subscriptions', sub);

    // 3) Payment (if any received)
    var payment = null;
    if (amountReceived > 0) {
      payment = recordPaymentInternal_(session, {
        customer_id: customer.customer_id,
        subscription_id: sub.subscription_id,
        entry_type: 'PAYMENT',
        amount: amountReceived,
        payment_date: payV.data.payment_date,
        payment_method: payV.data.payment_method,
        transaction_reference: payV.data.transaction_reference,
        notes: payV.data.notes,
      });
    }

    audit_(token, 'Customer', customer.customer_id, 'CREATE', null, customer);
    audit_(token, 'Subscription', sub.subscription_id, 'CREATE', null, sub);
    invalidateDashboardCache_();

    var payMap = {};
    if (payment) payMap[sub.subscription_id] = { paid: payment.amount, refunds: 0, net: payment.amount, count: 1 };
    return {
      customer: decorateCustomer_(customer, {}, {}),
      subscription: decorateSubscription_(sub, payMap),
      payment: payment,
    };
  });
}

function updateCustomer_(token, customerId, patch) {
  requireSession_(token);
  if (!cleanStr_(customerId)) throw new HubError_('VALIDATION', 'Customer ID is required.');
  patch = patch || {};
  return withLock_(function () {
    var existing = findById_('Customers', 'customer_id', customerId);
    if (!existing) throw new HubError_('NOT_FOUND', 'Customer not found.');

    var dbPatch = { updated_at: nowISO_() };

    if (patch.full_name !== undefined) {
      var name = cleanStr_(patch.full_name);
      if (name.length < 2) throw new HubError_('VALIDATION', 'Name is too short.', { full_name: 'Name is too short.' });
      dbPatch.full_name = name;
    }
    if (patch.notes !== undefined) dbPatch.notes = cleanStr_(patch.notes).slice(0, 2000);
    if (patch.joined_date !== undefined) {
      if (!parseISO_(patch.joined_date)) throw new HubError_('VALIDATION', 'Invalid joined date.', { joined_date: 'Invalid date.' });
      dbPatch.joined_date = patch.joined_date;
    }
    if (patch.phone_e164 !== undefined) {
      var e164 = normalizePhoneE164_(patch.phone_e164, getSettingCached_('default_country_code'));
      if (!e164) throw new HubError_('VALIDATION', 'Invalid phone number.', { phone_e164: 'Invalid phone number.' });
      var dup = findMany_('Customers', function (c) {
        return String(c.customer_id) !== String(customerId) && normalizePhoneE164_(c.phone_e164, '91') === e164;
      });
      if (dup.length) throw new HubError_('DUPLICATE_PHONE', 'Another customer already uses this number.');
      dbPatch.phone_e164 = e164;
    }

    updateRowById_('Customers', 'customer_id', customerId, dbPatch);
    audit_(token, 'Customer', customerId, 'UPDATE', existing, dbPatch);
    invalidateDashboardCache_();
    return findById_('Customers', 'customer_id', customerId);
  });
}

/** Archive or restore a customer. Never deletes history. */
function archiveCustomer_(token, customerId, archive) {
  requireSession_(token);
  if (!cleanStr_(customerId)) throw new HubError_('VALIDATION', 'Customer ID is required.');
  return withLock_(function () {
    var existing = findById_('Customers', 'customer_id', customerId);
    if (!existing) throw new HubError_('NOT_FOUND', 'Customer not found.');
    var val = toBool_(archive);
    updateRowById_('Customers', 'customer_id', customerId, { is_archived: val, updated_at: nowISO_() });
    audit_(token, 'Customer', customerId, val ? 'ARCHIVE' : 'RESTORE', { is_archived: toBool_(existing.is_archived) }, { is_archived: val });
    invalidateDashboardCache_();
    return { customer_id: customerId, is_archived: val };
  });
}

/** Full Customer 360 profile. */
function getCustomerProfile_(token, customerId) {
  requireSession_(token);
  var customer = findById_('Customers', 'customer_id', customerId);
  if (!customer) throw new HubError_('NOT_FOUND', 'Customer not found.');

  var subs = getSubscriptionsForCustomer_(customerId);
  var payments = readTable_('Payments').filter(function (p) { return String(p.customer_id) === String(customerId); });
  payments.forEach(function (p) { p.amount = parseAmount_(p.amount); });
  payments.sort(function (a, b) {
    var d = String(b.payment_date).localeCompare(String(a.payment_date));
    if (d !== 0) return d;
    return String(b.created_at).localeCompare(String(a.created_at));
  });

  var reminders = findMany_('ReminderLogs', function (r) { return String(r.customer_id) === String(customerId); });
  reminders.sort(function (a, b) { return String(b.scheduled_date).localeCompare(String(a.scheduled_date)); });

  // Lifetime collections (payments − refunds)
  var lifetimePaid = 0, lifetimeRefunds = 0;
  payments.forEach(function (p) {
    if (String(p.entry_type).toUpperCase() === 'REFUND') lifetimeRefunds += p.amount;
    else lifetimePaid += p.amount;
  });
  lifetimePaid = round2_(lifetimePaid);
  lifetimeRefunds = round2_(lifetimeRefunds);

  var current = selectCurrentSubscription_(subs);
  var upcoming = subs.filter(function (s) {
    return s.activation_status !== 'Cancelled' && s.start_date > todayISO_();
  }).sort(function (a, b) { return String(a.start_date).localeCompare(String(b.start_date)); })[0] || null;

  var activity = listAudit_(token, null, null, 200).filter(function (a) {
    return String(a.entity_id) === String(customerId) ||
      subs.some(function (s) { return String(a.entity_id) === String(s.subscription_id); }) ||
      payments.some(function (p) { return String(a.entity_id) === String(p.payment_id); });
  }).slice(0, 60);

  var decorated = decorateCustomer_(customer, {}, {});
  decorated.current_subscription = current;
  decorated.next_subscription = upcoming;

  return {
    customer: decorated,
    subscriptions: subs,
    payments: payments,
    reminders: reminders,
    lifetime: {
      total_payments: lifetimePaid,
      total_refunds: lifetimeRefunds,
      net_collected: round2_(lifetimePaid - lifetimeRefunds),
      outstanding: current ? current.outstanding : 0,
    },
    activity: activity,
  };
}
