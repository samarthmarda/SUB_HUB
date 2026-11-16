// Promise-based wrapper around google.script.run with success/failure handlers.
// In dev (no google.script.run), falls back to an in-memory mock so the UI renders.
import { getToken, setToken, clearSession, setLoginId } from './lib/session';
import { mockRun, mockReset } from './lib/mock';

export class ApiError extends Error {
  constructor(err) {
    super((err && err.message) || 'Request failed');
    this.name = 'ApiError';
    this.code = (err && err.code) || 'SERVER_ERROR';
    this.details = (err && err.details) || null;
  }
}

export const UNAUTHORIZED_EVENT = 'subhub:unauthorized';

function notifyUnauthorized() {
  clearSession();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
  }
}

function isGasAvailable() {
  return typeof window !== 'undefined' && !!(window.google && window.google.script && window.google.script.run);
}

// Core runner: resolves with `data`, rejects with ApiError.
export function gasRun(fnName, ...args) {
  if (isGasAvailable()) {
    return new Promise((resolve, reject) => {
      window.google.script.run
        .withSuccessHandler((res) => {
          if (res && res.ok === false) {
            const err = new ApiError(res.error);
            if (err.code === 'UNAUTHENTICATED' || err.code === 'NOT_SETUP') notifyUnauthorized();
            reject(err);
          } else {
            resolve(res && Object.prototype.hasOwnProperty.call(res, 'data') ? res.data : res);
          }
        })
        .withFailureHandler((err) => {
          reject(new ApiError({ code: 'SERVER_ERROR', message: (err && err.message) || 'The request failed. Please try again.' }));
        })
        [fnName](...args);
    });
  }
  return mockRun(fnName, args);
}

// The full typed API surface (mirrors apps-script/Api.gs).
export const api = {
  // auth
  login: (loginId, password) => gasRun('apiLogin', loginId, password),
  logout: () => gasRun('apiLogout', getToken()),
  getSession: () => gasRun('apiGetSession', getToken()),
  changePassword: (oldPassword, newPassword) => gasRun('apiChangePassword', getToken(), oldPassword, newPassword),
  changeLoginId: (newLoginId) => gasRun('apiChangeLoginId', getToken(), newLoginId),

  // dashboard
  dashboard: (range) => gasRun('apiGetDashboard', getToken(), range),

  // customers
  listCustomers: (params) => gasRun('apiListCustomers', getToken(), params || {}),
  customerProfile: (id) => gasRun('apiGetCustomerProfile', getToken(), id),
  createCustomer: (input) => gasRun('apiCreateCustomer', getToken(), input),
  updateCustomer: (id, patch) => gasRun('apiUpdateCustomer', getToken(), id, patch),
  archiveCustomer: (id, archive) => gasRun('apiArchiveCustomer', getToken(), id, archive),
  checkDuplicatePhone: (phone) => gasRun('apiCheckDuplicatePhone', getToken(), phone),
  capacity: () => gasRun('apiGetCapacity', getToken()),

  // subscriptions
  listSubscriptions: (filters) => gasRun('apiListSubscriptions', getToken(), filters || {}),
  createSubscription: (input) => gasRun('apiCreateSubscription', getToken(), input),
  renewSubscription: (input) => gasRun('apiRenewSubscription', getToken(), input),
  approveSubscription: (id) => gasRun('apiApproveSubscription', getToken(), id),
  cancelSubscription: (id, reason) => gasRun('apiCancelSubscription', getToken(), id, reason),

  // payments
  recordPayment: (input) => gasRun('apiRecordPayment', getToken(), input),
  listPayments: (filters) => gasRun('apiListPayments', getToken(), filters || {}),

  // renewals / calendar
  renewals: (view) => gasRun('apiGetRenewals', getToken(), view),
  calendar: (params) => gasRun('apiGetCalendarEvents', getToken(), params || {}),

  // reminders / whatsapp
  reminderQueue: (filters) => gasRun('apiGetReminderQueue', getToken(), filters || {}),
  markReminderSent: (id) => gasRun('apiMarkReminderSent', getToken(), id),
  logReminderClick: (id) => gasRun('apiLogReminderClick', getToken(), id),
  saveFollowUp: (id, patch) => gasRun('apiSaveFollowUp', getToken(), id, patch),
  ensureReminders: () => gasRun('apiEnsureReminders', getToken()),
  composeReminderWhatsApp: (id) => gasRun('apiComposeReminderWhatsApp', getToken(), id),
  composeCustomerWhatsApp: (id, type) => gasRun('apiComposeCustomerWhatsApp', getToken(), id, type),
  whatsappTemplates: () => gasRun('apiGetWhatsAppTemplates', getToken()),

  // search
  search: (query) => gasRun('apiSearch', getToken(), query),

  // reports
  reports: (range) => gasRun('apiGetReports', getToken(), range),
  exportCsv: (type) => gasRun('apiExportCsv', getToken(), type),

  // settings / plans
  settings: () => gasRun('apiGetSettings', getToken()),
  updateSettings: (patch) => gasRun('apiUpdateSettings', getToken(), patch),
  listPlans: () => gasRun('apiListPlans', getToken()),
  createPlan: (input) => gasRun('apiCreatePlan', getToken(), input),
  updatePlan: (id, patch) => gasRun('apiUpdatePlan', getToken(), id, patch),
  deactivatePlan: (id) => gasRun('apiDeactivatePlan', getToken(), id),

  // audit / system
  audit: (entityType, entityId, limit) => gasRun('apiGetAudit', getToken(), entityType, entityId, limit),
  createBackup: () => gasRun('apiCreateBackup', getToken()),
  triggerStatus: () => gasRun('apiGetTriggerStatus', getToken()),
  installReminderTrigger: () => gasRun('apiInstallReminderTrigger', getToken()),
};

// After a successful login, persist token + login id.
export function persistLogin(res) {
  if (res && res.token) {
    setToken(res.token);
    setLoginId(res.loginId || '');
  }
  return res;
}

// Invalidate the server session, clear local state, and notify the app so it
// returns to the login screen and drops all cached data.
export async function logoutAndClear() {
  try { await api.logout(); } catch (e) { /* ignore */ }
  clearSession();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
  }
}

export { mockReset };
