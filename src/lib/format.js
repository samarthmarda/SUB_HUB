// Display formatting helpers (frontend only — the backend always sends ISO strings / numbers).

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function parseISO(iso) {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso).trim());
  if (!m) return null;
  return { y: +m[1], mo: +m[2], d: +m[3] };
}

export function formatDate(iso) {
  const p = parseISO(iso);
  if (!p) return '—';
  return `${String(p.d).padStart(2, '0')} ${MONTHS[p.mo - 1]} ${p.y}`;
}

export function formatDateLong(iso) {
  const p = parseISO(iso);
  if (!p) return '—';
  return `${String(p.d).padStart(2, '0')} ${MONTHS_LONG[p.mo - 1]} ${p.y}`;
}

export function formatMonthLabel(iso) {
  const p = parseISO(iso);
  if (!p) return '';
  return `${MONTHS[p.mo - 1]} ${p.y}`;
}

export function todayISO() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function formatMoney(amount, symbol) {
  const sym = symbol || '₹';
  const n = Number(amount || 0);
  const fixed = Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  return (n < 0 ? '-' : '') + sym + fixed;
}

export function formatNumber(n) {
  return Number(n || 0).toLocaleString('en-IN');
}

/** Human phrasing for a day-offset relative to today. */
export function daysLabel(days) {
  if (days === null || days === undefined) return '—';
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days > 0) return `in ${days} days`;
  return `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago`;
}

export function initials(name) {
  if (!name) return '?';
  const parts = String(name).trim().split(/\s+/);
  return ((parts[0] || '')[0] || '') + ((parts[1] || '')[0] || '');
}

/** Normalise a raw phone to E.164 (mirrors backend rule) for optimistic display. */
export function normalizePhone(raw) {
  if (!raw) return '';
  let digits = String(raw).replace(/\D+/g, '');
  if (digits.indexOf('00') === 0 && digits.length > 11) digits = digits.slice(2);
  if (digits.indexOf('91') === 0 && digits.length === 12) return '+' + digits;
  if (digits.length === 11 && digits[0] === '0') digits = digits.slice(1);
  if (digits.length === 10) return '+91' + digits;
  if (digits.length >= 11 && digits.length <= 15) return '+' + digits;
  return '+' + digits;
}
