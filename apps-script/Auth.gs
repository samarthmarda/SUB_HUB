/**
 * SUBSCRIPTION HUB — Auth.gs
 * Authentication, salted password hashing and server-side session management.
 *
 * - Passwords are never stored in plaintext. We store iterations$salt$hash using
 *   a PBKDF2-style SHA-256 key-derivation loop (Utilities.computeDigest).
 * - Initial credentials (RAMESH / JSK) are seeded during setup; the temp password
 *   is hashed immediately and the plaintext is never persisted.
 * - Sessions are random tokens validated + expiry-checked server side on every API
 *   call. The token lives in the browser's sessionStorage only.
 */

var DEFAULT_SESSION_TTL_HOURS = 12;

function toHex_(bytes) {
  var s = '';
  for (var i = 0; i < bytes.length; i++) {
    var b = (bytes[i] & 0xff).toString(16);
    if (b.length < 2) b = '0' + b;
    s += b;
  }
  return s;
}

function generateSalt_() {
  if (typeof Utilities !== 'undefined' && Utilities && typeof Utilities.getUuid === 'function') {
    return Utilities.getUuid().replace(/-/g, '').slice(0, 24);
  }
  return (Math.random().toString(36).slice(2) + Date.now().toString(36)).slice(0, 24);
}

/** PBKDF2-style salted hash. Returns { iterations, salt, hash(hex) }. */
function hashPassword_(password, salt, iterations) {
  salt = salt || generateSalt_();
  iterations = iterations || 1500;
  var algo = Utilities.DigestAlgorithm.SHA_256;
  var cur = String(salt) + ':' + String(password);
  var digest = Utilities.computeDigest(algo, cur, Utilities.Charset.UTF8);
  for (var i = 0; i < iterations; i++) {
    cur = toHex_(digest) + ':' + String(salt) + ':' + i;
    digest = Utilities.computeDigest(algo, cur, Utilities.Charset.UTF8);
  }
  return { iterations: iterations, salt: String(salt), hash: toHex_(digest) };
}

function encodePasswordHash_(h) {
  return h.iterations + '$' + h.salt + '$' + h.hash;
}

function verifyPassword_(password, stored) {
  if (!stored) return false;
  var parts = String(stored).split('$');
  if (parts.length !== 3) return false;
  var iterations = Number(parts[0]);
  var salt = parts[1];
  var expected = parts[2];
  if (!isFinite(iterations) || !salt || !expected) return false;
  var h = hashPassword_(password, salt, iterations);
  return timingSafeEqual_(h.hash, expected);
}

function timingSafeEqual_(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) {
    diff |= (a.charCodeAt(i) ^ b.charCodeAt(i));
  }
  return diff === 0;
}

/** Seed the administrator on first setup. Idempotent — never overwrites an existing password. */
function seedAdminIfMissing_() {
  if (PROPS_.getProperty('ADMIN_PASSWORD_HASH')) return;
  PROPS_.setProperty('ADMIN_LOGIN_ID', 'RAMESH');
  PROPS_.setProperty('ADMIN_PASSWORD_HASH', encodePasswordHash_(hashPassword_('JSK')));
  PROPS_.setProperty('ADMIN_MUST_CHANGE_PASSWORD', 'true');
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

function sessionTtlMs_() {
  var h = Number(PROPS_.getProperty('SESSION_TTL_HOURS') || DEFAULT_SESSION_TTL_HOURS);
  if (!isFinite(h) || h <= 0) h = DEFAULT_SESSION_TTL_HOURS;
  return h * 3600 * 1000;
}

function createSession_(loginId, mustChange) {
  purgeExpiredSessions_();
  var token = uuid_();
  var now = Date.now();
  var session = {
    loginId: loginId,
    createdAt: now,
    expiresAt: now + sessionTtlMs_(),
    mustChange: !!mustChange,
  };
  PROPS_.setProperty('SESSION_' + token, JSON.stringify(session));
  return token;
}

function saveSession_(token, session) {
  PROPS_.setProperty('SESSION_' + token, JSON.stringify(session));
}

/** Return a valid, unexpired session object or null. */
function getSession_(token) {
  if (!token || typeof token !== 'string') return null;
  var raw = PROPS_.getProperty('SESSION_' + token);
  if (!raw) return null;
  var s = safeJsonParse_(raw, null);
  if (!s || !s.expiresAt) {
    PROPS_.deleteProperty('SESSION_' + token);
    return null;
  }
  if (Date.now() > s.expiresAt) {
    PROPS_.deleteProperty('SESSION_' + token);
    return null;
  }
  return s;
}

/** Guard used by every API function except login. Throws HubError('UNAUTHENTICATED'). */
function requireSession_(token) {
  var s = getSession_(token);
  if (!s) {
    throw new HubError_('UNAUTHENTICATED', 'Your session has expired. Please log in again.');
  }
  return s;
}

function destroySession_(token) {
  if (token) PROPS_.deleteProperty('SESSION_' + token);
}

function purgeExpiredSessions_() {
  var props = PROPS_.getProperties();
  var now = Date.now();
  Object.keys(props).forEach(function (k) {
    if (k.indexOf('SESSION_') === 0) {
      var s = safeJsonParse_(props[k], null);
      if (!s || !s.expiresAt || now > s.expiresAt) PROPS_.deleteProperty(k);
    }
  });
}

// ---------------------------------------------------------------------------
// Credential operations
// ---------------------------------------------------------------------------

function login_(loginId, password) {
  var storedId = PROPS_.getProperty('ADMIN_LOGIN_ID');
  var storedHash = PROPS_.getProperty('ADMIN_PASSWORD_HASH');
  if (!storedHash) {
    throw new HubError_('NOT_SETUP', 'Setup has not been completed. Run setupSubscriptionHub() first.');
  }
  var idOk = storedId && cleanStr_(loginId).toUpperCase() === String(storedId).toUpperCase();
  if (!idOk || !verifyPassword_(password, storedHash)) {
    throw new HubError_('INVALID_CREDENTIALS', 'Incorrect login ID or password.');
  }
  var mustChange = PROPS_.getProperty('ADMIN_MUST_CHANGE_PASSWORD') === 'true';
  var token = createSession_(storedId, mustChange);
  return { token: token, mustChangePassword: mustChange, loginId: storedId };
}

function logout_(token) {
  destroySession_(token);
  return true;
}

function changePassword_(token, oldPassword, newPassword) {
  var session = requireSession_(token);
  var v = validatePassword_(newPassword);
  if (!v.ok) throw new HubError_('WEAK_PASSWORD', v.error);

  var storedHash = PROPS_.getProperty('ADMIN_PASSWORD_HASH');
  // Old password required unless this is the forced first-login change.
  if (!session.mustChange && !verifyPassword_(oldPassword, storedHash)) {
    throw new HubError_('INVALID_CREDENTIALS', 'Current password is incorrect.');
  }
  PROPS_.setProperty('ADMIN_PASSWORD_HASH', encodePasswordHash_(hashPassword_(newPassword)));
  PROPS_.setProperty('ADMIN_MUST_CHANGE_PASSWORD', 'false');
  session.mustChange = false;
  saveSession_(token, session);
  return true;
}

function changeLoginId_(token, newLoginId) {
  var session = requireSession_(token);
  var v = validateLoginId_(newLoginId);
  if (!v.ok) throw new HubError_('INVALID_LOGIN_ID', v.error);
  PROPS_.setProperty('ADMIN_LOGIN_ID', v.value);
  session.loginId = v.value;
  saveSession_(token, session);
  return { loginId: v.value };
}

function getSessionInfo_(token) {
  var session = requireSession_(token);
  return {
    loginId: session.loginId,
    mustChangePassword: !!session.mustChange,
    expiresAt: new Date(session.expiresAt).toISOString(),
    ttlHours: sessionTtlMs_() / 3600000,
  };
}
