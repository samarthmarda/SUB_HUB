// Session token management. The token lives only in sessionStorage (cleared on tab close / logout).
const TOKEN_KEY = 'subhub.session.token';
const LOGIN_KEY = 'subhub.session.loginId';

export function getToken() {
  try { return sessionStorage.getItem(TOKEN_KEY); } catch (e) { return null; }
}
export function setToken(t) {
  try { if (t) sessionStorage.setItem(TOKEN_KEY, t); else sessionStorage.removeItem(TOKEN_KEY); } catch (e) { /* ignore */ }
}
export function getLoginId() {
  try { return sessionStorage.getItem(LOGIN_KEY); } catch (e) { return null; }
}
export function setLoginId(id) {
  try { if (id) sessionStorage.setItem(LOGIN_KEY, id); else sessionStorage.removeItem(LOGIN_KEY); } catch (e) { /* ignore */ }
}
export function clearSession() {
  try { sessionStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem(LOGIN_KEY); } catch (e) { /* ignore */ }
}
export function isLoggedIn() {
  return !!getToken();
}
