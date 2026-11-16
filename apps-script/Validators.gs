/**
 * SUBSCRIPTION HUB — Validators.gs
 * Server-side input validation. Pure functions (standard JS + Utils helpers only),
 * so they can be unit-tested by evaluating this file alongside Utils.gs.
 *
 * Every validator returns a consistent shape:
 *   { ok: boolean, errors: { field: message }, data: { ...cleaned fields } }
 */

var ALLOWED_PAYMENT_METHODS = ['Cash', 'UPI', 'Bank Transfer', 'Card', 'Cheque', 'Other'];
var ALLOWED_DURATION_UNITS = ['DAY', 'WEEK', 'MONTH', 'YEAR'];
var ALLOWED_ENTRY_TYPES = ['PAYMENT', 'REFUND'];
var ALLOWED_ACTIVATION = ['Pending Approval', 'Approved', 'Rejected', 'Cancelled'];

function newValidation_() {
  return { ok: true, errors: {}, data: {} };
}

function addError_(res, field, message) {
  res.ok = false;
  if (!res.errors[field]) res.errors[field] = message;
  return res;
}

/** Validate & normalise a phone number. */
function validatePhone_(raw, defaultCountry) {
  var e164 = normalizePhoneE164_(raw, defaultCountry || '91');
  if (!e164) {
    return { ok: false, error: 'Enter a valid phone number (e.g. 9876543210).' };
  }
  return { ok: true, e164: e164 };
}

/** Validate the personal section of a customer. */
function validateCustomerInput_(input, defaultCountry) {
  var res = newValidation_();
  input = input || {};

  var name = cleanStr_(input.full_name);
  if (!name) addError_(res, 'full_name', 'Full name is required.');
  else if (name.length < 2) addError_(res, 'full_name', 'Name is too short.');
  else if (name.length > 120) addError_(res, 'full_name', 'Name is too long.');
  res.data.full_name = name;

  var phone = validatePhone_(input.phone, defaultCountry);
  if (!phone.ok) addError_(res, 'phone', phone.error);
  else res.data.phone_e164 = phone.e164;

  var joined = cleanStr_(input.joined_date);
  if (!joined) {
    res.data.joined_date = todayISO_();
  } else if (!parseISO_(joined)) {
    addError_(res, 'joined_date', 'Joined date is not a valid date.');
  } else {
    res.data.joined_date = joined;
  }

  res.data.notes = cleanStr_(input.notes).slice(0, 2000);
  return res;
}

/** Validate the subscription section (shared by create + renew). */
function validateSubscriptionInput_(input) {
  var res = newValidation_();
  input = input || {};

  if (!cleanStr_(input.plan_id) && !cleanStr_(input.plan_name)) {
    addError_(res, 'plan_id', 'Select a subscription plan.');
  }
  res.data.plan_id = cleanStr_(input.plan_id);
  res.data.plan_name = cleanStr_(input.plan_name);

  var start = cleanStr_(input.start_date);
  if (!start || !parseISO_(start)) addError_(res, 'start_date', 'Start date is required and must be valid.');
  res.data.start_date = start;

  var expiry = cleanStr_(input.expiry_date);
  if (!expiry || !parseISO_(expiry)) {
    addError_(res, 'expiry_date', 'Expiry date is required and must be valid.');
  } else if (parseISO_(start) && parseISO_(expiry) && parseISO_(expiry).getTime() < parseISO_(start).getTime()) {
    addError_(res, 'expiry_date', 'Expiry date cannot be before the start date.');
  }
  res.data.expiry_date = expiry;

  var due = parseAmount_(input.amount_due);
  if (due < 0) addError_(res, 'amount_due', 'Amount due cannot be negative.');
  res.data.amount_due = due;

  var unit = String(input.duration_unit || '').toUpperCase();
  if (unit && ALLOWED_DURATION_UNITS.indexOf(unit) === -1) {
    addError_(res, 'duration_unit', 'Invalid duration unit.');
  }
  res.data.duration_unit = unit;
  res.data.duration_value = Number(input.duration_value || 0) || 0;
  res.data.expiry_is_manual = toBool_(input.expiry_is_manual);

  return res;
}

/** Validate the payment section. */
function validatePaymentInput_(input) {
  var res = newValidation_();
  input = input || {};

  var entryType = String(input.entry_type || 'PAYMENT').toUpperCase();
  if (ALLOWED_ENTRY_TYPES.indexOf(entryType) === -1) {
    addError_(res, 'entry_type', 'Entry type must be PAYMENT or REFUND.');
  }
  res.data.entry_type = entryType;

  var amount = parseAmount_(input.amount);
  if (amount <= 0) addError_(res, 'amount', 'Amount must be greater than zero.');
  res.data.amount = amount;

  var date = cleanStr_(input.payment_date);
  if (!date) res.data.payment_date = todayISO_();
  else if (!parseISO_(date)) addError_(res, 'payment_date', 'Payment date is not a valid date.');
  else res.data.payment_date = date;

  var method = cleanStr_(input.payment_method);
  if (method && ALLOWED_PAYMENT_METHODS.indexOf(method) === -1) {
    addError_(res, 'payment_method', 'Unsupported payment method.');
  }
  res.data.payment_method = method;

  res.data.transaction_reference = cleanStr_(input.transaction_reference).slice(0, 200);
  res.data.notes = cleanStr_(input.notes).slice(0, 1000);
  return res;
}

/** Validate a subscription plan definition. */
function validatePlanInput_(input) {
  var res = newValidation_();
  input = input || {};

  var name = cleanStr_(input.plan_name);
  if (!name) addError_(res, 'plan_name', 'Plan name is required.');
  else if (name.length > 80) addError_(res, 'plan_name', 'Plan name is too long.');
  res.data.plan_name = name;

  var unit = String(input.duration_unit || '').toUpperCase();
  if (ALLOWED_DURATION_UNITS.indexOf(unit) === -1) addError_(res, 'duration_unit', 'Select a valid duration unit.');
  res.data.duration_unit = unit;

  var value = Number(input.duration_value);
  if (!isFinite(value) || value <= 0) addError_(res, 'duration_value', 'Duration must be a positive number.');
  res.data.duration_value = value;

  var price = parseAmount_(input.default_price);
  if (price < 0) addError_(res, 'default_price', 'Default price cannot be negative.');
  res.data.default_price = price;

  res.data.is_active = toBool_(input.is_active);
  res.data.display_order = Number(input.display_order || 0) || 0;
  return res;
}

/** Validate a login ID + password strength. */
function validatePassword_(pw) {
  if (!pw || String(pw).length < 6) {
    return { ok: false, error: 'Password must be at least 6 characters.' };
  }
  if (String(pw).length > 128) {
    return { ok: false, error: 'Password is too long.' };
  }
  return { ok: true };
}

function validateLoginId_(id) {
  id = cleanStr_(id);
  if (!id) return { ok: false, error: 'Login ID is required.' };
  if (id.length < 3 || id.length > 40) return { ok: false, error: 'Login ID must be 3–40 characters.' };
  if (!/^[A-Za-z0-9_.@-]+$/.test(id)) return { ok: false, error: 'Login ID may only contain letters, numbers and _ . @ -' };
  return { ok: true, value: id };
}
