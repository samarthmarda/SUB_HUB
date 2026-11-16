/**
 * SUBSCRIPTION HUB — Triggers.gs
 * Scheduled reminder generation (daily ~09:00 Asia/Kolkata), scheduled backups,
 * manual backup with a retention policy, and a one-click setup+install helper.
 */

var REMINDER_TRIGGER_FUNCTION = 'generateRemindersForTrigger';
var BACKUP_TRIGGER_FUNCTION = 'scheduledBackupForTrigger';
var BACKUP_NAME_PREFIX = 'SUBSCRIPTION HUB - BACKUP -';
var BACKUP_RETENTION = 8; // keep the most recent N backups

/** Trigger target — generates reminders (idempotent). Runs without a session. */
function generateRemindersForTrigger() {
  return generateRemindersInternal_();
}

/** Remove any existing hub triggers for a function, then install a fresh one. */
function installReminderTrigger_() {
  removeTriggersFor_(REMINDER_TRIGGER_FUNCTION);
  var hour = Number(getSettingCached_('reminder_hour') || 9);
  if (!isFinite(hour) || hour < 0 || hour > 23) hour = 9;
  ScriptApp.newTrigger(REMINDER_TRIGGER_FUNCTION)
    .timeBased()
    .atHour(hour)
    .nearMinute(0)
    .everyDays(1)
    .create();
  return true;
}

function installBackupTrigger_() {
  removeTriggersFor_(BACKUP_TRIGGER_FUNCTION);
  ScriptApp.newTrigger(BACKUP_TRIGGER_FUNCTION)
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.SUNDAY)
    .atHour(2)
    .create();
  return true;
}

function removeTriggersFor_(functionName) {
  var triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(function (t) {
    if (t.getHandlerFunction() === functionName) ScriptApp.deleteTrigger(t);
  });
}

function uninstallAllTriggers_() {
  removeTriggersFor_(REMINDER_TRIGGER_FUNCTION);
  removeTriggersFor_(BACKUP_TRIGGER_FUNCTION);
  return true;
}

/** Current trigger status for the Settings screen. */
function getTriggerStatus_() {
  var triggers = ScriptApp.getProjectTriggers();
  var reminder = null, backup = null;
  triggers.forEach(function (t) {
    if (t.getHandlerFunction() === REMINDER_TRIGGER_FUNCTION) reminder = { event: 'daily', hour: Number(getSettingCached_('reminder_hour') || 9) };
    if (t.getHandlerFunction() === BACKUP_TRIGGER_FUNCTION) backup = { event: 'weekly (Sunday 02:00)' };
  });
  return { reminder_trigger: reminder, backup_trigger: backup, installed: !!reminder };
}

// ---------------------------------------------------------------------------
// Backups
// ---------------------------------------------------------------------------

/** Manual backup: copy the live spreadsheet. Returns backup metadata. */
function createBackup_(token) {
  requireSession_(token);
  var ss = openHubSpreadsheet_();
  var name = BACKUP_NAME_PREFIX + new Date().toISOString().slice(0, 10) + ' ' + new Date().toTimeString().slice(0, 8).replace(/:/g, '');
  var copy = ss.copy(name);
  pruneBackups_();
  return { url: copy.getUrl(), id: copy.getId(), name: name, created_at: nowISO_() };
}

/** Scheduled backup target — creates a backup then prunes old ones. */
function scheduledBackupForTrigger() {
  var ss = openHubSpreadsheet_();
  var name = BACKUP_NAME_PREFIX + new Date().toISOString().slice(0, 10);
  var copy = ss.copy(name);
  pruneBackups_();
  return copy.getId();
}

/** Keep only the most recent BACKUP_RETENTION backups; delete older ones. */
function pruneBackups_() {
  try {
    var files = DriveApp.getFilesByName;
    var names = [];
    var it = DriveApp.getFiles();
    var backups = [];
    while (it.hasNext()) {
      var f = it.next();
      if (f.getName().indexOf(BACKUP_NAME_PREFIX) === 0) backups.push(f);
    }
    backups.sort(function (a, b) {
      return String(b.getDateCreated().getTime()) - String(a.getDateCreated().getTime());
    });
    for (var i = BACKUP_RETENTION; i < backups.length; i++) {
      backups[i].setTrashed(true);
    }
  } catch (e) { /* pruning is best-effort */ }
}

// ---------------------------------------------------------------------------
// One-click setup
// ---------------------------------------------------------------------------

/**
 * Convenience for the owner: run setup, seed data, install the reminder trigger.
 * Returns the spreadsheet URL. Safe to run repeatedly.
 */
function setupAndInstall() {
  var result = setupSubscriptionHub();
  installReminderTrigger_();
  return result;
}
