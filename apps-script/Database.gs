/**
 * SUBSCRIPTION HUB — Database.gs
 * All spreadsheet access flows through here. Reads/writes are batched (one
 * getValues / setValues per operation), never cell-by-cell in loops. Multi-sheet
 * writes are wrapped in withLock_() by the calling services.
 *
 * Date-only columns are stored as real Date cells pinned to UTC noon so they render
 * as the correct calendar day in the spreadsheet timezone and round-trip cleanly.
 * Timestamp columns are stored as ISO datetime strings.
 */

var PROPS_ = PropertiesService.getScriptProperties();

function getSpreadsheetId_() {
  return PROPS_.getProperty('SPREADSHEET_ID') || null;
}

function openHubSpreadsheet_() {
  var id = getSpreadsheetId_();
  if (!id) {
    throw new HubError_('DB_NOT_INITIALISED', 'Database not initialised. Run setupSubscriptionHub() once.');
  }
  return SpreadsheetApp.openById(id);
}

function getSheetByName_(name) {
  var ss = openHubSpreadsheet_();
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    throw new HubError_('SHEET_MISSING', 'Missing sheet "' + name + '". Run setupSubscriptionHub().');
  }
  return sheet;
}

function sheetExists_(name) {
  var ss = openHubSpreadsheet_();
  return ss.getSheetByName(name) !== null;
}

/** Convert an ISO date string into a Date cell value (UTC noon to avoid TZ rollover). */
function isoToCellDate_(iso) {
  var d = parseISO_(iso);
  if (!d) return '';
  return new Date(d.getTime() + 12 * 3600 * 1000); // UTC noon
}

/**
 * Read an entire sheet into an array of plain objects keyed by header name.
 * Date-only columns are converted to YYYY-MM-DD strings. Empty rows (blank id) skipped.
 */
function readTable_(sheetName) {
  var sheet = getSheetByName_(sheetName);
  var headers = headersFor_(sheetName);
  var dateCols = dateColsFor_(sheetName);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  var out = [];
  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    if (row[0] === '' || row[0] === null || row[0] === undefined) continue; // skip blank
    var obj = {};
    for (var j = 0; j < headers.length; j++) {
      var v = row[j];
      var h = headers[j];
      if (dateCols.indexOf(h) !== -1) {
        obj[h] = (v instanceof Date) ? toISO_(v) : (v ? String(v) : '');
      } else {
        obj[h] = v;
      }
    }
    out.push(obj);
  }
  return out;
}

/** Append one or more objects as new rows (single batched setValues). */
function appendRows_(sheetName, objs) {
  if (!objs || !objs.length) return;
  var sheet = getSheetByName_(sheetName);
  var headers = headersFor_(sheetName);
  var dateCols = dateColsFor_(sheetName);
  var rows = objs.map(function (obj) {
    return headers.map(function (h) {
      var v = obj[h];
      if (v === undefined || v === null) return '';
      if (dateCols.indexOf(h) !== -1) return v ? isoToCellDate_(v) : '';
      return v;
    });
  });
  var start = sheet.getLastRow() + 1;
  sheet.getRange(start, 1, rows.length, headers.length).setValues(rows);
}

/** Append a single object. */
function appendRow_(sheetName, obj) {
  appendRows_(sheetName, [obj]);
}

function findRowNumberById_(sheet, headers, idField, id) {
  var idColIdx = headers.indexOf(idField);
  if (idColIdx === -1) return -1;
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  var idValues = sheet.getRange(2, idColIdx + 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < idValues.length; i++) {
    if (String(idValues[i][0]) === String(id)) return i + 2;
  }
  return -1;
}

/**
 * Update a single row identified by idField==id, merging only the fields present in patch.
 * Returns true if a row was updated.
 */
function updateRowById_(sheetName, idField, id, patch) {
  var sheet = getSheetByName_(sheetName);
  var headers = headersFor_(sheetName);
  var dateCols = dateColsFor_(sheetName);
  var rowNumber = findRowNumberById_(sheet, headers, idField, id);
  if (rowNumber === -1) return false;
  var current = sheet.getRange(rowNumber, 1, 1, headers.length).getValues()[0];
  for (var j = 0; j < headers.length; j++) {
    var h = headers[j];
    if (Object.prototype.hasOwnProperty.call(patch, h)) {
      var nv = patch[h];
      if (dateCols.indexOf(h) !== -1) {
        current[j] = nv ? isoToCellDate_(nv) : '';
      } else {
        current[j] = (nv === undefined || nv === null) ? '' : nv;
      }
    }
  }
  sheet.getRange(rowNumber, 1, 1, headers.length).setValues([current]);
  return true;
}

/** Update many rows in one pass. updates = [{ id, patch }]. Returns count updated. */
function updateRowsById_(sheetName, idField, updates) {
  if (!updates || !updates.length) return 0;
  var sheet = getSheetByName_(sheetName);
  var headers = headersFor_(sheetName);
  var dateCols = dateColsFor_(sheetName);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  var all = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  var idColIdx = headers.indexOf(idField);
  var byId = {};
  updates.forEach(function (u) { byId[String(u.id)] = u.patch; });
  var changed = false;
  for (var i = 0; i < all.length; i++) {
    var patch = byId[String(all[i][idColIdx])];
    if (!patch) continue;
    changed = true;
    for (var j = 0; j < headers.length; j++) {
      var h = headers[j];
      if (Object.prototype.hasOwnProperty.call(patch, h)) {
        var nv = patch[h];
        all[i][j] = (dateCols.indexOf(h) !== -1)
          ? (nv ? isoToCellDate_(nv) : '')
          : ((nv === undefined || nv === null) ? '' : nv);
      }
    }
  }
  if (changed) sheet.getRange(2, 1, all.length, headers.length).setValues(all);
  return updates.length;
}

/** Count non-archived rows of a boolean archive flag column (for capacity). */
function countActiveRows_(sheetName, archiveField) {
  var rows = readTable_(sheetName);
  var n = 0;
  for (var i = 0; i < rows.length; i++) {
    if (!toBool_(rows[i][archiveField])) n++;
  }
  return n;
}

/** Find a single row object by id field value. Returns null if not found. */
function findById_(sheetName, idField, id) {
  var rows = readTable_(sheetName);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][idField]) === String(id)) return rows[i];
  }
  return null;
}

/** Find all row objects matching a predicate. */
function findMany_(sheetName, predicate) {
  var rows = readTable_(sheetName);
  return rows.filter(predicate);
}

// ---------------------------------------------------------------------------
// Locking
// ---------------------------------------------------------------------------

/**
 * Run fn while holding the script lock. Prevents concurrent multi-sheet writes
 * and duplicate sequential code generation. Throws a friendly error on timeout.
 */
function withLock_(fn, timeoutMs) {
  var lock = LockService.getScriptLock();
  var acquired = lock.tryLock(timeoutMs || 25000);
  if (!acquired) {
    throw new HubError_('BUSY', 'The system is busy. Please try again in a moment.');
  }
  try {
    return fn();
  } finally {
    try { lock.releaseLock(); } catch (e) { /* already released */ }
  }
}

// ---------------------------------------------------------------------------
// Structured errors
// ---------------------------------------------------------------------------

function HubError_(code, message, details) {
  this.name = 'HubError';
  this.code = code || 'ERROR';
  this.message = message || 'Something went wrong.';
  this.details = details || null;
}
HubError_.prototype = Object.create(Error.prototype);
HubError_.prototype.constructor = HubError_;

function isHubError_(e) {
  return e && e.name === 'HubError';
}

/** Convert any thrown value into a consistent, safe API error object. */
function toApiError_(e) {
  if (isHubError_(e)) {
    return { ok: false, error: { code: e.code, message: e.message } };
  }
  // Never leak stack traces / internals to the client.
  return { ok: false, error: { code: 'SERVER_ERROR', message: 'An unexpected error occurred. Please try again.' } };
}

function apiOk_(data) {
  return { ok: true, data: data === undefined ? null : data };
}
