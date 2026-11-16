/**
 * SUBSCRIPTION HUB — AuditService.gs
 * Append-only audit trail for important customer, subscription, payment and
 * settings changes. UI actions can never erase audit history.
 */

function audit_(token, entityType, entityId, action, before, after) {
  try {
    var performedBy = 'system';
    var s = token ? getSession_(token) : null;
    if (s && s.loginId) performedBy = s.loginId;
    appendRow_('AuditLog', {
      audit_id: uuid_(),
      entity_type: String(entityType || ''),
      entity_id: String(entityId || ''),
      action: String(action || ''),
      before_json: (before === undefined || before === null) ? '' : objToJson_(before),
      after_json: (after === undefined || after === null) ? '' : objToJson_(after),
      performed_by: performedBy,
      timestamp: nowISO_(),
    });
  } catch (e) {
    // Auditing must never break a business operation.
  }
}

/** Recent audit entries, decorated, newest first. Internal (no session guard). */
function recentAuditRows_(limit) {
  var rows = readTable_('AuditLog');
  rows.sort(function (a, b) { return String(b.timestamp).localeCompare(String(a.timestamp)); });
  return rows.slice(0, clamp_(limit || 12, 1, 200)).map(function (r) {
    return {
      audit_id: r.audit_id,
      entity_type: r.entity_type,
      entity_id: r.entity_id,
      action: r.action,
      before: safeJsonParse_(r.before_json, null),
      after: safeJsonParse_(r.after_json, null),
      performed_by: r.performed_by,
      timestamp: r.timestamp,
    };
  });
}

/** List audit entries, optionally filtered by entity. Newest first. */
function listAudit_(token, entityType, entityId, limit) {
  requireSession_(token);
  var rows = readTable_('AuditLog');
  rows.sort(function (a, b) { return String(b.timestamp).localeCompare(String(a.timestamp)); });
  if (entityType) rows = rows.filter(function (r) { return String(r.entity_type) === String(entityType); });
  if (entityId) rows = rows.filter(function (r) { return String(r.entity_id) === String(entityId); });
  var max = clamp_(limit || 100, 1, 500);
  return rows.slice(0, max).map(function (r) {
    return {
      audit_id: r.audit_id,
      entity_type: r.entity_type,
      entity_id: r.entity_id,
      action: r.action,
      before: safeJsonParse_(r.before_json, null),
      after: safeJsonParse_(r.after_json, null),
      performed_by: r.performed_by,
      timestamp: r.timestamp,
    };
  });
}
