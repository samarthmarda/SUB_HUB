/**
 * SUBSCRIPTION HUB — Utils.gs
 * Pure helper functions used across the backend.
 *
 * IMPORTANT: keep the functions in this file free of SpreadsheetApp / CacheService
 * / PropertiesService dependencies so they remain deterministic and unit-testable
 * (see tests/run-tests.mjs). Only uuid_() and todayISO_() touch platform globals,
 * and both provide safe fallbacks when those globals are absent (Node test runner).
 *
 * Date convention: "date-only" values are handled as YYYY-MM-DD strings across the
 * API boundary, and internally as JS Date objects pinned to UTC midnight. This keeps
 * calendar math (months, leap years, month-end) free of timezone drift. The business
 * timezone (Asia/Kolkata) is only applied when deriving "today".
 */

var MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
var DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Generate a UUID. Uses Apps Script's Utilities when available, otherwise a fallback. */
function uuid_() {
  if (typeof Utilities !== 'undefined' && Utilities && typeof Utilities.getUuid === 'function') {
    return Utilities.getUuid();
  }
  if (typeof globalThis !== 'undefined' && globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** Today's date in the business timezone, as YYYY-MM-DD. */
function todayISO_() {
  var now = new Date();
  if (typeof Utilities !== 'undefined' && Utilities && typeof Utilities.formatDate === 'function') {
    return Utilities.formatDate(now, getBusinessTimeZone_(), 'yyyy-MM-dd');
  }
  // Fallback: use local date components.
  var y = now.getFullYear();
  var m = String(now.getMonth() + 1).padStart(2, '0');
  var d = String(now.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + d;
}

/** Current timestamp as ISO datetime string (UTC). */
function nowISO_() {
  return new Date().toISOString();
}

/** Business timezone. Defaults to Asia/Kolkata; overridden by Settings. */
function getBusinessTimeZone_() {
  try {
    var tz = getSettingCached_('timezone');
    return tz || 'Asia/Kolkata';
  } catch (e) {
    return 'Asia/Kolkata';
  }
}

// ---------------------------------------------------------------------------
// Date-only helpers (YYYY-MM-DD <-> UTC-midnight Date)
// ---------------------------------------------------------------------------

/** Parse a YYYY-MM-DD string into a Date pinned at UTC midnight. Returns null if invalid. */
function parseISO_(iso) {
  if (iso instanceof Date) {
    return new Date(Date.UTC(iso.getFullYear(), iso.getMonth(), iso.getDate()));
  }
  if (typeof iso !== 'string') return null;
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return null;
  var d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  // Guard against overflow like 2026-02-31 silently rolling into March.
  if (d.getUTCFullYear() !== Number(m[1]) || d.getUTCMonth() !== Number(m[2]) - 1 || d.getUTCDate() !== Number(m[3])) {
    return null;
  }
  return d;
}

/** Convert a Date (or Date-like) to a YYYY-MM-DD string using its UTC components. */
function toISO_(date) {
  if (!date) return null;
  var d = (date instanceof Date) ? date : parseISO_(date);
  if (!d) return null;
  var y = d.getUTCFullYear();
  var m = String(d.getUTCMonth() + 1).padStart(2, '0');
  var day = String(d.getUTCDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

/** Add n days to a YYYY-MM-DD string. Returns YYYY-MM-DD. */
function addDaysISO_(iso, n) {
  var d = parseISO_(iso);
  if (!d) return null;
  d.setUTCDate(d.getUTCDate() + Number(n || 0));
  return toISO_(d);
}

/**
 * Add a duration to a YYYY-MM-DD date.
 * unit: 'DAY' | 'WEEK' | 'MONTH' | 'YEAR'
 * Handles month-end clamping and leap years (e.g. Jan 31 + 1 month => Feb 28/29).
 */
function addDurationISO_(iso, value, unit) {
  var d = parseISO_(iso);
  if (!d) return null;
  value = Number(value);
  if (!isFinite(value)) return null;
  var u = String(unit || '').toUpperCase();
  if (u === 'DAY') {
    d.setUTCDate(d.getUTCDate() + value);
  } else if (u === 'WEEK') {
    d.setUTCDate(d.getUTCDate() + value * 7);
  } else if (u === 'MONTH') {
    var targetMonth = d.getUTCMonth() + value;
    var year = d.getUTCFullYear() + Math.floor(targetMonth / 12);
    var month = ((targetMonth % 12) + 12) % 12;
    var day = d.getUTCDate();
    var lastDay = daysInMonth_(year, month);
    if (day > lastDay) day = lastDay;
    d = new Date(Date.UTC(year, month, day));
  } else if (u === 'YEAR') {
    var y2 = d.getUTCFullYear() + value;
    var m2 = d.getUTCMonth();
    var day2 = d.getUTCDate();
    if (m2 === 1 && day2 === 29 && !isLeapYear_(y2)) day2 = 28; // Feb 29 -> Feb 28
    d = new Date(Date.UTC(y2, m2, day2));
  } else {
    return null;
  }
  return toISO_(d);
}

function isLeapYear_(y) {
  return (y % 4 === 0 && y % 100 !== 0) || (y % 400 === 0);
}

function daysInMonth_(year, monthIndex) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/**
 * Compute an inclusive expiry date from a start date + duration.
 * Rule: expiry = start + duration - 1 day (so the full period is covered inclusively).
 */
function computeExpiryISO_(startISO, value, unit) {
  var end = addDurationISO_(startISO, value, unit);
  if (!end) return null;
  return addDaysISO_(end, -1);
}

/** Whole days from a -> b (b - a). Returns integer. */
function daysBetweenISO_(aISO, bISO) {
  var a = parseISO_(aISO);
  var b = parseISO_(bISO);
  if (!a || !b) return null;
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

/** Days remaining from today until iso (negative if in the past). */
function daysFromToday_(iso) {
  return daysBetweenISO_(todayISO_(), iso);
}

/** 'YYYY-MM' bucket for a date. */
function monthKey_(iso) {
  var d = parseISO_(iso);
  if (!d) return null;
  return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
}

/** Human-friendly display date, e.g. "11 Aug 2026". Pure (no timezone). */
function formatDisplayDate_(iso) {
  var d = parseISO_(iso);
  if (!d) return '';
  return String(d.getUTCDate()).padStart(2, '0') + ' ' + MONTH_NAMES[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
}

/** Weekday name for a date, e.g. "Mon". */
function weekdayName_(iso) {
  var d = parseISO_(iso);
  if (!d) return '';
  return DAY_NAMES[d.getUTCDay()];
}

/** Start of month (first day) for the month containing iso. */
function startOfMonthISO_(iso) {
  var d = parseISO_(iso);
  if (!d) return null;
  return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-01';
}

// ---------------------------------------------------------------------------
// Phone normalization (E.164), default country = India (91)
// ---------------------------------------------------------------------------

/**
 * Normalise a phone number to E.164. For a bare 10-digit Indian mobile returns +91XXXXXXXXXX.
 * Strips spaces, dashes, brackets. Handles leading 0, 00, or existing country codes.
 * Returns null when the number cannot be interpreted as a valid international number.
 */
function normalizePhoneE164_(raw, defaultCountry) {
  if (raw === null || raw === undefined) return null;
  defaultCountry = defaultCountry || '91';
  var digits = String(raw).replace(/\D+/g, '');
  if (!digits) return null;

  // Convert international prefix 00 -> drop
  if (digits.indexOf('00') === 0 && digits.length > 11) {
    digits = digits.slice(2);
  }
  // If it already starts with the default country code and has correct length, keep.
  var cc = String(defaultCountry).replace(/\D+/g, '');
  if (cc && digits.indexOf(cc) === 0) {
    var rest = digits.slice(cc.length);
    // Indian mobile: 10 digits after 91
    if (cc === '91' && /^[6-9]\d{9}$/.test(rest)) return '+' + cc + rest;
    if (digits.length >= 11 && digits.length <= 15) return '+' + digits;
  }
  // Leading single 0 (national trunk prefix) -> drop it
  if (digits.length === 11 && digits.charAt(0) === '0') {
    digits = digits.slice(1);
  }
  // Indian 10-digit mobile
  if (/^[6-9]\d{9}$/.test(digits) && cc === '91') {
    return '+' + cc + digits;
  }
  // Bare 10-digit without a known default -> assume default country
  if (/^\d{10}$/.test(digits) && cc) {
    return '+' + cc + digits;
  }
  // Already a plausible full international number
  if (digits.length >= 11 && digits.length <= 15) {
    return '+' + digits;
  }
  return null;
}

/** Digits-only form for wa.me links (strip + and non-digits). */
function phoneForWhatsApp_(e164) {
  if (!e164) return '';
  return String(e164).replace(/\D+/g, '');
}

// ---------------------------------------------------------------------------
// Money / numeric helpers
// ---------------------------------------------------------------------------

/** Parse a monetary amount to a Number rounded to 2 decimals. Returns 0 for invalid. */
function parseAmount_(v) {
  if (v === null || v === undefined || v === '') return 0;
  var n = (typeof v === 'number') ? v : parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
  if (!isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function round2_(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

// ---------------------------------------------------------------------------
// ID / code helpers
// ---------------------------------------------------------------------------

/** Format a sequential customer code: CUST-0001. */
function formatCustomerCode_(n) {
  return 'CUST-' + String(n).padStart(4, '0');
}

/** Build a deterministic dedupe key from parts. */
function dedupeKey_() {
  var parts = [];
  for (var i = 0; i < arguments.length; i++) parts.push(String(arguments[i]));
  return parts.join('|');
}

// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------

function clamp_(n, min, max) {
  return Math.min(Math.max(Number(n), min), max);
}

/** Return the first message from a validation errors map (for throwing HubError). */
function firstError_(errors) {
  if (!errors) return 'Invalid input.';
  var keys = Object.keys(errors);
  return keys.length ? errors[keys[0]] : 'Invalid input.';
}

function safeJsonParse_(str, fallback) {
  if (!str) return fallback;
  try {
    return JSON.parse(str);
  } catch (e) {
    return fallback;
  }
}

function objToJson_(obj) {
  try {
    return JSON.stringify(obj === undefined ? null : obj);
  } catch (e) {
    return null;
  }
}

/** Trim + collapse whitespace on a string; returns '' for nullish. */
function cleanStr_(v) {
  if (v === null || v === undefined) return '';
  return String(v).replace(/\s+/g, ' ').trim();
}

/** Truthy check tolerant of string 'true'/'false' coming from sheets. */
function toBool_(v) {
  if (v === true) return true;
  if (v === false || v === null || v === undefined) return false;
  var s = String(v).trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'yes' || s === 'y';
}
