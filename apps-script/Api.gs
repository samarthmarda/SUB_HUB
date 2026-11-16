/**
 * SUBSCRIPTION HUB — Api.gs
 * Explicit, documented server API. Every function except apiLogin requires a valid
 * session token (passed as the first argument from the browser). All responses are
 * consistent JSON: { ok: true, data } or { ok: false, error: { code, message } }.
 *
 * Internal helper functions (ending in _) are NOT exposed to the client.
 */

// --- Authentication -------------------------------------------------------

function apiLogin(loginId, password) {
  try { return apiOk_(login_(loginId, password)); } catch (e) { return toApiError_(e); }
}

function apiLogout(token) {
  try { return apiOk_(logout_(token)); } catch (e) { return toApiError_(e); }
}

function apiGetSession(token) {
  try { return apiOk_(getSessionInfo_(token)); } catch (e) { return toApiError_(e); }
}

function apiChangePassword(token, oldPassword, newPassword) {
  try { return apiOk_(changePassword_(token, oldPassword, newPassword)); } catch (e) { return toApiError_(e); }
}

function apiChangeLoginId(token, newLoginId) {
  try { return apiOk_(changeLoginId_(token, newLoginId)); } catch (e) { return toApiError_(e); }
}

// --- Dashboard ------------------------------------------------------------

function apiGetDashboard(token, range) {
  try { return apiOk_(getDashboard_(token, range)); } catch (e) { return toApiError_(e); }
}

// --- Customers ------------------------------------------------------------

function apiListCustomers(token, params) {
  try { return apiOk_(listCustomers_(token, params || {})); } catch (e) { return toApiError_(e); }
}

function apiGetCustomerProfile(token, customerId) {
  try { return apiOk_(getCustomerProfile_(token, customerId)); } catch (e) { return toApiError_(e); }
}

function apiCreateCustomer(token, input) {
  try { return apiOk_(createCustomer_(token, input || {})); } catch (e) { return toApiError_(e); }
}

function apiUpdateCustomer(token, customerId, patch) {
  try { return apiOk_(updateCustomer_(token, customerId, patch || {})); } catch (e) { return toApiError_(e); }
}

function apiArchiveCustomer(token, customerId, archive) {
  try { return apiOk_(archiveCustomer_(token, customerId, archive)); } catch (e) { return toApiError_(e); }
}

function apiCheckDuplicatePhone(token, phone) {
  try { return apiOk_(checkDuplicatePhone_(token, phone)); } catch (e) { return toApiError_(e); }
}

function apiGetCapacity(token) {
  try { requireSession_(token); return apiOk_(getCustomerCapacity_()); } catch (e) { return toApiError_(e); }
}

// --- Subscriptions --------------------------------------------------------

function apiListSubscriptions(token, filters) {
  try { return apiOk_(listSubscriptions_(token, filters || {})); } catch (e) { return toApiError_(e); }
}

function apiCreateSubscription(token, input) {
  try { return apiOk_(createSubscription_(token, input || {})); } catch (e) { return toApiError_(e); }
}

function apiRenewSubscription(token, input) {
  try { return apiOk_(renewSubscription_(token, input || {})); } catch (e) { return toApiError_(e); }
}

function apiApproveSubscription(token, subscriptionId) {
  try { return apiOk_(approveSubscription_(token, subscriptionId)); } catch (e) { return toApiError_(e); }
}

function apiCancelSubscription(token, subscriptionId, reason) {
  try { return apiOk_(cancelSubscription_(token, subscriptionId, reason)); } catch (e) { return toApiError_(e); }
}

// --- Payments -------------------------------------------------------------

function apiRecordPayment(token, input) {
  try { return apiOk_(recordPayment_(token, input || {})); } catch (e) { return toApiError_(e); }
}

function apiListPayments(token, filters) {
  try { return apiOk_(listPayments_(token, filters || {})); } catch (e) { return toApiError_(e); }
}

// --- Renewals & calendar --------------------------------------------------

function apiGetRenewals(token, view) {
  try { return apiOk_(getRenewals_(token, view)); } catch (e) { return toApiError_(e); }
}

function apiGetCalendarEvents(token, params) {
  try { return apiOk_(getCalendarEvents_(token, params || {})); } catch (e) { return toApiError_(e); }
}

// --- Reminders & WhatsApp -------------------------------------------------

function apiGetReminderQueue(token, filters) {
  try { return apiOk_(getReminderQueue_(token, filters || {})); } catch (e) { return toApiError_(e); }
}

function apiMarkReminderSent(token, reminderId) {
  try { return apiOk_(markReminderSent_(token, reminderId)); } catch (e) { return toApiError_(e); }
}

function apiLogReminderClick(token, reminderId) {
  try { return apiOk_(logWhatsAppClick_(token, reminderId)); } catch (e) { return toApiError_(e); }
}

function apiSaveFollowUp(token, reminderId, patch) {
  try { return apiOk_(saveReminderFollowUp_(token, reminderId, patch || {})); } catch (e) { return toApiError_(e); }
}

function apiEnsureReminders(token) {
  try { return apiOk_(ensureRemindersCatchUp_(token)); } catch (e) { return toApiError_(e); }
}

function apiComposeReminderWhatsApp(token, reminderId) {
  try { return apiOk_(composeReminderWhatsApp_(token, reminderId)); } catch (e) { return toApiError_(e); }
}

function apiComposeCustomerWhatsApp(token, customerId, type) {
  try { return apiOk_(composeCustomerWhatsApp_(token, customerId, type)); } catch (e) { return toApiError_(e); }
}

function apiGetWhatsAppTemplates(token) {
  try { return apiOk_(getWhatsAppTemplates_(token)); } catch (e) { return toApiError_(e); }
}

// --- Search ---------------------------------------------------------------

function apiSearch(token, query) {
  try { return apiOk_(performSearch_(token, query)); } catch (e) { return toApiError_(e); }
}

function performSearch_(token, query) {
  requireSession_(token);
  var q = cleanStr_(query).toLowerCase();
  if (!q) return { query: query || '', customers: [], subscriptions: [] };
  var digits = q.replace(/\D+/g, '');

  var customers = readTable_('Customers').filter(function (c) {
    return String(c.full_name).toLowerCase().indexOf(q) !== -1 ||
      String(c.customer_id).toLowerCase().indexOf(q) !== -1 ||
      String(c.customer_code).toLowerCase().indexOf(q) !== -1 ||
      (digits && String(c.phone_e164).replace(/\D+/g, '').indexOf(digits) !== -1);
  }).slice(0, 10).map(function (c) {
    return {
      customer_id: c.customer_id,
      customer_code: c.customer_code,
      full_name: c.full_name,
      phone_e164: c.phone_e164,
      is_archived: toBool_(c.is_archived),
    };
  });

  var subs = readTable_('Subscriptions').filter(function (s) {
    return String(s.subscription_id).toLowerCase().indexOf(q) !== -1;
  }).slice(0, 10).map(function (s) {
    var d = decorateSubscription_(s);
    var c = findById_('Customers', 'customer_id', s.customer_id) || {};
    return {
      subscription_id: s.subscription_id,
      customer_id: s.customer_id,
      customer_name: c.full_name || '',
      plan_name: d.plan_name,
      expiry_date: s.expiry_date,
    };
  });

  return { query: query, customers: customers, subscriptions: subs };
}

// --- Reports --------------------------------------------------------------

function apiGetReports(token, range) {
  try { return apiOk_(getReports_(token, range)); } catch (e) { return toApiError_(e); }
}

function apiExportCsv(token, type) {
  try { return apiOk_(exportReportCsv_(token, type)); } catch (e) { return toApiError_(e); }
}

// --- Settings & plans -----------------------------------------------------

function apiGetSettings(token) {
  try { return apiOk_(getSettings_(token)); } catch (e) { return toApiError_(e); }
}

function apiUpdateSettings(token, patch) {
  try { return apiOk_(updateSettings_(token, patch || {})); } catch (e) { return toApiError_(e); }
}

function apiListPlans(token) {
  try { return apiOk_(listPlans_(token)); } catch (e) { return toApiError_(e); }
}

function apiCreatePlan(token, input) {
  try { return apiOk_(createPlan_(token, input || {})); } catch (e) { return toApiError_(e); }
}

function apiUpdatePlan(token, planId, patch) {
  try { return apiOk_(updatePlan_(token, planId, patch || {})); } catch (e) { return toApiError_(e); }
}

function apiDeactivatePlan(token, planId) {
  try { return apiOk_(deactivatePlan_(token, planId)); } catch (e) { return toApiError_(e); }
}

// --- Audit / system -------------------------------------------------------

function apiGetAudit(token, entityType, entityId, limit) {
  try { return apiOk_(listAudit_(token, entityType, entityId, limit)); } catch (e) { return toApiError_(e); }
}

function apiCreateBackup(token) {
  try { return apiOk_(createBackup_(token)); } catch (e) { return toApiError_(e); }
}

function apiGetTriggerStatus(token) {
  try { requireSession_(token); return apiOk_(getTriggerStatus_()); } catch (e) { return toApiError_(e); }
}

function apiInstallReminderTrigger(token) {
  try { requireSession_(token); return apiOk_(installReminderTrigger_()); } catch (e) { return toApiError_(e); }
}
