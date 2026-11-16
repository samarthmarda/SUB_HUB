/**
 * SUBSCRIPTION HUB — SettingsService.gs
 * Application configuration (Settings tab) and subscription-plan management.
 * Settings are cached briefly in CacheService and invalidated on write.
 */

var SETTINGS_CACHE_KEY = 'HUB_SETTINGS_MAP';
var SETTINGS_CACHE_TTL = 300; // seconds

function getSettingsMap_() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get(SETTINGS_CACHE_KEY);
  if (cached) return safeJsonParse_(cached, {}) || {};
  var rows = readTable_('Settings');
  var map = {};
  rows.forEach(function (r) { map[String(r.setting_key)] = r.setting_value; });
  try { cache.put(SETTINGS_CACHE_KEY, objToJson_(map), SETTINGS_CACHE_TTL); } catch (e) { /* cache optional */ }
  return map;
}

/** Single cached setting (used widely, incl. timezone resolution). */
function getSettingCached_(key) {
  try { return getSettingsMap_()[key]; } catch (e) { return null; }
}

function getSetting_(key, fallback) {
  var v = getSettingCached_(key);
  return (v === undefined || v === null || v === '') ? (fallback === undefined ? null : fallback) : v;
}

function clearSettingsCache_() {
  try { CacheService.getScriptCache().remove(SETTINGS_CACHE_KEY); } catch (e) { /* ignore */ }
}

/** Keys an administrator is allowed to edit from Settings. */
var EDITABLE_SETTINGS = [
  'business_name', 'currency', 'currency_symbol', 'default_country_code', 'timezone',
  'customer_capacity', 'reminder_enabled', 'reminder_days_before', 'reminder_hour',
  'whatsapp_template_7day', 'whatsapp_template_3day', 'whatsapp_template_expiryday',
  'whatsapp_template_expired', 'session_ttl_hours',
];

/** Public, secret-free settings for the frontend. */
function getSettings_(token) {
  requireSession_(token);
  var map = getSettingsMap_();
  var out = {};
  EDITABLE_SETTINGS.forEach(function (k) { out[k] = map[k] === undefined ? '' : map[k]; });
  out.customer_capacity = out.customer_capacity || '500';
  out.currency = out.currency || 'INR';
  out.currency_symbol = out.currency_symbol || '₹';
  out.default_country_code = out.default_country_code || '91';
  out.timezone = out.timezone || 'Asia/Kolkata';
  out.schema_version = String(PROPS_.getProperty('SCHEMA_VERSION') || SCHEMA_VERSION);
  out.spreadsheet_url = (function () {
    try { return openHubSpreadsheet_().getUrl(); } catch (e) { return ''; }
  })();
  return out;
}

function updateSettings_(token, patch) {
  requireSession_(token);
  patch = patch || {};
  var updates = [];
  var before = getSettingsMap_();
  Object.keys(patch).forEach(function (k) {
    if (EDITABLE_SETTINGS.indexOf(k) === -1) return;
    updates.push({ setting_key: k, setting_value: String(patch[k] === undefined || patch[k] === null ? '' : patch[k]) });
  });
  if (!updates.length) return true;

  withLock_(function () {
    updates.forEach(function (u) {
      var existed = updateRowById_('Settings', 'setting_key', u.setting_key, {
        setting_value: u.setting_value,
        updated_at: nowISO_(),
      });
      if (!existed) {
        appendRow_('Settings', { setting_key: u.setting_key, setting_value: u.setting_value, updated_at: nowISO_() });
      }
    });
  });
  clearSettingsCache_();
  audit_(token, 'Settings', 'settings', 'UPDATE', before, patch);
  return true;
}

// ---------------------------------------------------------------------------
// Subscription plans
// ---------------------------------------------------------------------------

function listPlans_(token) {
  requireSession_(token);
  var plans = readTable_('SubscriptionPlans');
  plans.forEach(function (p) {
    p.default_price = parseAmount_(p.default_price);
    p.duration_value = Number(p.duration_value || 0);
    p.display_order = Number(p.display_order || 0);
    p.is_active = toBool_(p.is_active);
  });
  plans.sort(function (a, b) {
    if (a.display_order !== b.display_order) return a.display_order - b.display_order;
    return String(a.plan_name).localeCompare(String(b.plan_name));
  });
  return plans;
}

function nextPlanOrder_() {
  var plans = readTable_('SubscriptionPlans');
  var max = 0;
  plans.forEach(function (p) { max = Math.max(max, Number(p.display_order || 0)); });
  return max + 1;
}

function createPlan_(token, input) {
  requireSession_(token);
  var v = validatePlanInput_(input);
  if (!v.ok) throw new HubError_('VALIDATION', firstError_(v.errors), v.errors);
  return withLock_(function () {
    var plan = {
      plan_id: uuid_(),
      plan_name: v.data.plan_name,
      duration_value: v.data.duration_value,
      duration_unit: v.data.duration_unit,
      default_price: v.data.default_price,
      is_active: v.data.is_active,
      display_order: v.data.display_order || nextPlanOrder_(),
      created_at: nowISO_(),
      updated_at: nowISO_(),
    };
    appendRow_('SubscriptionPlans', plan);
    audit_(token, 'Plan', plan.plan_id, 'CREATE', null, plan);
    return plan;
  });
}

function updatePlan_(token, planId, patch) {
  requireSession_(token);
  if (!cleanStr_(planId)) throw new HubError_('VALIDATION', 'Plan ID is required.');
  var before = findById_('SubscriptionPlans', 'plan_id', planId);
  if (!before) throw new HubError_('NOT_FOUND', 'Plan not found.');
  // Validate any provided fields.
  var merged = {
    plan_name: patch.plan_name !== undefined ? patch.plan_name : before.plan_name,
    duration_value: patch.duration_value !== undefined ? patch.duration_value : before.duration_value,
    duration_unit: patch.duration_unit !== undefined ? patch.duration_unit : before.duration_unit,
    default_price: patch.default_price !== undefined ? patch.default_price : before.default_price,
    is_active: patch.is_active !== undefined ? patch.is_active : toBool_(before.is_active),
    display_order: patch.display_order !== undefined ? patch.display_order : before.display_order,
  };
  var v = validatePlanInput_(merged);
  if (!v.ok) throw new HubError_('VALIDATION', firstError_(v.errors), v.errors);

  var dbPatch = {
    plan_name: v.data.plan_name,
    duration_value: v.data.duration_value,
    duration_unit: v.data.duration_unit,
    default_price: v.data.default_price,
    is_active: v.data.is_active,
    display_order: v.data.display_order,
    updated_at: nowISO_(),
  };
  var ok = updateRowById_('SubscriptionPlans', 'plan_id', planId, dbPatch);
  if (!ok) throw new HubError_('NOT_FOUND', 'Plan not found.');
  audit_(token, 'Plan', planId, 'UPDATE', before, dbPatch);
  return findById_('SubscriptionPlans', 'plan_id', planId);
}

/** Deactivate (soft) a plan so it is not offered for new subscriptions. History is retained. */
function deactivatePlan_(token, planId) {
  return updatePlan_(token, planId, { is_active: false });
}
