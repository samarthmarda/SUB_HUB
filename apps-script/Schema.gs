/**
 * SUBSCRIPTION HUB — Schema.gs
 * Single source of truth for the spreadsheet structure + the idempotent setup
 * function that creates/configures the central Google Spreadsheet.
 *
 * setupSubscriptionHub() is safe to run repeatedly: it never creates duplicate
 * spreadsheets, tabs, headers or seed records, and never deletes existing data.
 */

var SPREADSHEET_NAME = 'SUBSCRIPTION HUB - DATABASE';
var SCHEMA_VERSION = 1;

/**
 * Column layout for every tab. `dateCols` are stored as real Date cells and
 * surfaced as YYYY-MM-DD strings by Database.readTable_. `currencyCols`,
 * `boolCols` and `validations` drive sheet formatting.
 */
var SCHEMA = {
  version: SCHEMA_VERSION,
  sheets: [
    {
      name: 'Customers',
      headers: ['customer_id', 'customer_code', 'full_name', 'phone_e164', 'joined_date', 'notes', 'is_archived', 'created_at', 'updated_at'],
      dateCols: ['joined_date'],
      boolCols: ['is_archived'],
      validations: { is_archived: ['FALSE', 'TRUE'] },
      widths: [120, 110, 200, 150, 120, 260, 110, 160, 160],
    },
    {
      name: 'Subscriptions',
      headers: ['subscription_id', 'customer_id', 'plan_id', 'plan_name_snapshot', 'duration_value', 'duration_unit', 'start_date', 'expiry_date', 'expiry_is_manual', 'amount_due', 'activation_status', 'previous_subscription_id', 'renewed_by_subscription_id', 'approved_by', 'approved_at', 'cancelled_at', 'cancel_reason', 'created_at', 'updated_at'],
      dateCols: ['start_date', 'expiry_date'],
      currencyCols: ['amount_due'],
      boolCols: ['expiry_is_manual'],
      validations: {
        duration_unit: ['DAY', 'WEEK', 'MONTH', 'YEAR'],
        expiry_is_manual: ['FALSE', 'TRUE'],
        activation_status: ['Pending Approval', 'Approved', 'Rejected', 'Cancelled'],
      },
      widths: [130, 120, 110, 160, 90, 100, 120, 120, 120, 110, 140, 150, 160, 110, 160, 160, 200, 160, 160],
    },
    {
      name: 'Payments',
      headers: ['payment_id', 'customer_id', 'subscription_id', 'entry_type', 'amount', 'payment_date', 'payment_method', 'transaction_reference', 'notes', 'created_at', 'created_by'],
      dateCols: ['payment_date'],
      currencyCols: ['amount'],
      validations: {
        entry_type: ['PAYMENT', 'REFUND'],
        payment_method: ['Cash', 'UPI', 'Bank Transfer', 'Card', 'Cheque', 'Other'],
      },
      widths: [120, 120, 130, 100, 110, 120, 130, 180, 220, 160, 110],
    },
    {
      name: 'SubscriptionPlans',
      headers: ['plan_id', 'plan_name', 'duration_value', 'duration_unit', 'default_price', 'is_active', 'display_order', 'created_at', 'updated_at'],
      currencyCols: ['default_price'],
      boolCols: ['is_active'],
      validations: {
        duration_unit: ['DAY', 'WEEK', 'MONTH', 'YEAR'],
        is_active: ['FALSE', 'TRUE'],
      },
      widths: [110, 160, 110, 110, 120, 100, 110, 160, 160],
    },
    {
      name: 'ReminderLogs',
      headers: ['reminder_id', 'customer_id', 'subscription_id', 'reminder_type', 'scheduled_date', 'status', 'generated_at', 'whatsapp_clicked_at', 'manually_marked_sent_at', 'followup_status', 'notes', 'dedupe_key'],
      dateCols: ['scheduled_date'],
      validations: {
        reminder_type: ['7day', '3day', 'expiryday', 'expired', 'manual'],
        status: ['Pending', 'WhatsApp Clicked', 'Manually Marked Sent', 'Customer Responded', 'Payment Pending', 'Renewed', 'Not Renewing'],
        followup_status: ['None', 'Pending', 'Completed'],
      },
      widths: [120, 120, 130, 110, 130, 150, 160, 170, 180, 130, 220, 200],
    },
    {
      name: 'Settings',
      headers: ['setting_key', 'setting_value', 'updated_at'],
      widths: [220, 400, 160],
    },
    {
      name: 'AuditLog',
      headers: ['audit_id', 'entity_type', 'entity_id', 'action', 'before_json', 'after_json', 'performed_by', 'timestamp'],
      widths: [120, 120, 130, 140, 400, 400, 110, 170],
    },
  ],
};

function schemaSheet_(name) {
  for (var i = 0; i < SCHEMA.sheets.length; i++) {
    if (SCHEMA.sheets[i].name === name) return SCHEMA.sheets[i];
  }
  return null;
}

function headersFor_(sheetName) {
  var s = schemaSheet_(sheetName);
  if (!s) throw new HubError_('SCHEMA', 'Unknown sheet: ' + sheetName);
  return s.headers;
}

function dateColsFor_(sheetName) {
  var s = schemaSheet_(sheetName);
  return s ? (s.dateCols || []) : [];
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

/**
 * Create/connect the central spreadsheet and configure every tab.
 * Idempotent. Returns { spreadsheetId, url, created: boolean }.
 */
function setupSubscriptionHub() {
  var props = PROPS_;
  var id = props.getProperty('SPREADSHEET_ID');
  var ss = null;
  var created = false;

  if (id) {
    try {
      ss = SpreadsheetApp.openById(id);
    } catch (e) {
      ss = null; // stale id — recreate below
    }
  }
  if (!ss) {
    ss = SpreadsheetApp.create(SPREADSHEET_NAME);
    id = ss.getId();
    props.setProperty('SPREADSHEET_ID', id);
    created = true;
  }

  try { ss.setSpreadsheetTimeZone('Asia/Kolkata'); } catch (e) { /* ignore */ }

  ensureSheets_(ss);
  migrateSchema_(ss);
  ensureSettings_(ss);
  ensureDefaultPlans_(ss);
  seedAdminIfMissing_();

  props.setProperty('SCHEMA_VERSION', String(SCHEMA_VERSION));
  props.setProperty('SETUP_COMPLETED', 'true');

  return {
    spreadsheetId: id,
    url: ss.getUrl(),
    created: created,
  };
}

/** Create any missing tabs, write headers, and apply formatting (idempotent). */
function ensureSheets_(ss) {
  SCHEMA.sheets.forEach(function (def) {
    var sheet = ss.getSheetByName(def.name);
    if (!sheet) {
      sheet = ss.insertSheet(def.name);
    }
    // Headers: only (re)write if the header row is empty/mismatched.
    var needHeaders = true;
    if (sheet.getLastRow() >= 1) {
      var existing = sheet.getRange(1, 1, 1, def.headers.length).getValues()[0];
      var match = true;
      for (var i = 0; i < def.headers.length; i++) {
        if (String(existing[i]) !== def.headers[i]) { match = false; break; }
      }
      needHeaders = !match;
    }
    if (needHeaders) {
      sheet.getRange(1, 1, 1, def.headers.length).setValues([def.headers]);
      applyHeaderFormatting_(sheet, def);
    }
    applyColumnFormatting_(sheet, def);
    try { sheet.setFrozenRows(1); } catch (e) { /* ignore */ }
    try {
      if (!sheet.getFilter()) {
        sheet.getRange(1, 1, Math.max(sheet.getLastRow(), 1), def.headers.length).createFilter();
      }
    } catch (e) { /* filters optional */ }
  });

  // Remove the default "Sheet1" if it is still empty.
  try {
    var def = ss.getSheetByName('Sheet1');
    if (def && def.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(def);
  } catch (e) { /* ignore */ }
}

function applyHeaderFormatting_(sheet, def) {
  try {
    var range = sheet.getRange(1, 1, 1, def.headers.length);
    range.setFontWeight('bold')
      .setFontColor('#FFFFFF')
      .setBackground('#3B2A2E') // deep charcoal-burgundy
      .setVerticalAlignment('middle');
    sheet.setRowHeight(1, 34);
  } catch (e) { /* ignore */ }
}

function applyColumnFormatting_(sheet, def) {
  try {
    // Column widths
    if (def.widths) {
      for (var i = 0; i < def.widths.length && i < def.headers.length; i++) {
        sheet.setColumnWidth(i + 1, def.widths[i]);
      }
    }
    var maxRows = Math.max(sheet.getMaxRows(), 500);

    // Date formats
    (def.dateCols || []).forEach(function (h) {
      var idx = def.headers.indexOf(h);
      if (idx !== -1) sheet.getRange(2, idx + 1, maxRows - 1, 1).setNumberFormat('yyyy-mm-dd');
    });

    // Currency formats
    (def.currencyCols || []).forEach(function (h) {
      var idx = def.headers.indexOf(h);
      if (idx !== -1) sheet.getRange(2, idx + 1, maxRows - 1, 1).setNumberFormat('#,##0.00');
    });

    // Data validation dropdowns
    if (def.validations) {
      Object.keys(def.validations).forEach(function (h) {
        var idx = def.headers.indexOf(h);
        if (idx === -1) return;
        var rule = SpreadsheetApp.newDataValidation()
          .requireValueInList(def.validations[h], true)
          .setAllowInvalid(true)
          .build();
        sheet.getRange(2, idx + 1, maxRows - 1, 1).setDataValidation(rule);
      });
    }
  } catch (e) { /* formatting is best-effort */ }
}

// ---------------------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------------------

function ensureSettings_(ss) {
  var defaults = defaultSettings_();
  var sheet = ss.getSheetByName('Settings');
  var existing = {};
  var lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    var vals = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
    vals.forEach(function (r) { existing[String(r[0])] = true; });
  }
  var toAdd = [];
  Object.keys(defaults).forEach(function (k) {
    if (!existing[k]) toAdd.push({ setting_key: k, setting_value: defaults[k], updated_at: nowISO_() });
  });
  if (toAdd.length) {
    var rows = toAdd.map(function (o) { return [o.setting_key, o.setting_value, o.updated_at]; });
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 3).setValues(rows);
  }
}

function defaultSettings_() {
  return {
    business_name: 'SUBSCRIPTION HUB',
    currency: 'INR',
    currency_symbol: '₹',
    default_country_code: '91',
    timezone: 'Asia/Kolkata',
    customer_capacity: '500',
    reminder_enabled: 'true',
    reminder_days_before: '7,3,0',
    reminder_hour: '9',
    whatsapp_template_7day:
      'Hi {{customer_name}},\n\nYour subscription for our stock market calls group is due for renewal on {{expiry_date}}.\n\nPlease plan your renewal to continue receiving our market updates.\n\nThank you.',
    whatsapp_template_3day:
      'Hi {{customer_name}},\n\nJust a reminder that your subscription expires on {{expiry_date}}.\n\nPlease complete your renewal to continue receiving our market updates.\n\nThank you.',
    whatsapp_template_expiryday:
      'Hi {{customer_name}},\n\nYour subscription expires today.\n\nPlease renew to continue receiving our market updates.\n\nThank you.',
    whatsapp_template_expired:
      'Hi {{customer_name}},\n\nYour subscription expired on {{expiry_date}}.\n\nPlease contact us for renewal if you would like to continue receiving our updates.\n\nThank you.',
  };
}

function ensureDefaultPlans_(ss) {
  var sheet = ss.getSheetByName('SubscriptionPlans');
  if (sheet.getLastRow() >= 2) return; // plans already exist — never duplicate
  var ts = nowISO_();
  var plans = [
    { plan_name: 'Monthly', duration_value: 1, duration_unit: 'MONTH', default_price: 1000, display_order: 1 },
    { plan_name: 'Quarterly', duration_value: 3, duration_unit: 'MONTH', default_price: 2700, display_order: 2 },
    { plan_name: 'Half-yearly', duration_value: 6, duration_unit: 'MONTH', default_price: 5000, display_order: 3 },
    { plan_name: 'Yearly', duration_value: 1, duration_unit: 'YEAR', default_price: 9000, display_order: 4 },
    { plan_name: 'Custom', duration_value: 1, duration_unit: 'DAY', default_price: 0, display_order: 5 },
  ];
  var rows = plans.map(function (p, i) {
    return [uuid_(), p.plan_name, p.duration_value, p.duration_unit, p.default_price, true, p.display_order, ts, ts];
  });
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 9).setValues(rows);
}

// ---------------------------------------------------------------------------
// Migrations (versioned)
// ---------------------------------------------------------------------------

/**
 * Apply versioned schema migrations. Currently V1 has no structural changes beyond
 * ensureSheets_(). Future versions add steps keyed by version number.
 */
function migrateSchema_(ss) {
  var current = Number(PROPS_.getProperty('SCHEMA_VERSION') || 0);
  var steps = {
    // 2: function () { /* example future migration */ },
  };
  Object.keys(steps).map(Number).sort(function (a, b) { return a - b; }).forEach(function (v) {
    if (v > current) {
      try { steps[v](ss); } catch (e) { /* log + continue */ }
    }
  });
}
