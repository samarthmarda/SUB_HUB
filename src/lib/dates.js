// Frontend date math (mirrors apps-script/Utils.gs) for optimistic expiry preview.
function parse(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) return null;
  return d;
}
function toISO(d) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}
export function addDays(iso, n) {
  const d = parse(iso);
  if (!d) return null;
  d.setUTCDate(d.getUTCDate() + n);
  return toISO(d);
}
function daysInMonth(y, m) { return new Date(Date.UTC(y, m + 1, 0)).getUTCDate(); }
export function addDuration(iso, value, unit) {
  const d = parse(iso);
  if (!d) return null;
  value = Number(value);
  const u = String(unit || '').toUpperCase();
  if (u === 'DAY') d.setUTCDate(d.getUTCDate() + value);
  else if (u === 'WEEK') d.setUTCDate(d.getUTCDate() + value * 7);
  else if (u === 'MONTH') {
    const tm = d.getUTCMonth() + value;
    const y = d.getUTCFullYear() + Math.floor(tm / 12);
    const m = ((tm % 12) + 12) % 12;
    const day = Math.min(d.getUTCDate(), daysInMonth(y, m));
    return toISO(new Date(Date.UTC(y, m, day)));
  } else if (u === 'YEAR') {
    const y = d.getUTCFullYear() + value;
    let day = d.getUTCDate();
    if (d.getUTCMonth() === 1 && day === 29 && !((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0)) day = 28;
    return toISO(new Date(Date.UTC(y, d.getUTCMonth(), day)));
  } else return null;
  return toISO(d);
}
/** Inclusive expiry = start + duration − 1 day. */
export function computeExpiry(start, value, unit) {
  const end = addDuration(start, value, unit);
  return end ? addDays(end, -1) : null;
}
export function diffDays(from, to) {
  const a = parse(from); const b = parse(to);
  if (!a || !b) return null;
  return Math.round((b - a) / 86400000);
}
export function startOfMonth(iso) { const d = parse(iso); return d ? `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01` : null; }
export function addMonths(iso, n) { return addDuration(iso, n, 'MONTH'); }
