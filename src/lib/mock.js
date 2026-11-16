// In-memory mock of the Apps Script backend, used ONLY in local dev/preview when
// google.script.run is unavailable. It lets the whole UI render with realistic data.
import { ApiError } from '../api.js';

const DAY = 86400000;
function pad(n) { return String(n).padStart(2, '0'); }
function iso(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function todayISO() { return iso(new Date()); }
function addDays(dateStr, n) { const d = new Date(dateStr + 'T00:00:00'); d.setDate(d.getDate() + n); return iso(d); }
function daysFromToday(dateStr) { return Math.round((new Date(dateStr + 'T00:00:00') - new Date(todayISO() + 'T00:00:00')) / DAY); }
function uuid() { return 'id-' + Math.random().toString(36).slice(2, 10); }
function money(n) { return Math.round(n * 100) / 100; }

const NAMES = ['Aarav Sharma', 'Diya Patel', 'Rohan Verma', 'Ananya Iyer', 'Kabir Singh', 'Ishaan Gupta', 'Meera Nair', 'Vihaan Rao', 'Saanvi Joshi', 'Arjun Menon', 'Navya Kulkarni', 'Reyansh Das', 'Kiara Bose', 'Aditya Chauhan', 'Priya Reddy', 'Siddharth Jain'];
const PLANS = [
  { plan_id: 'p1', plan_name: 'Monthly', duration_value: 1, duration_unit: 'MONTH', default_price: 1000 },
  { plan_id: 'p2', plan_name: 'Quarterly', duration_value: 3, duration_unit: 'MONTH', default_price: 2700 },
  { plan_id: 'p3', plan_name: 'Half-yearly', duration_value: 6, duration_unit: 'MONTH', default_price: 5000 },
  { plan_id: 'p4', plan_name: 'Yearly', duration_value: 1, duration_unit: 'YEAR', default_price: 9000 },
];
const METHODS = ['UPI', 'Cash', 'Bank Transfer', 'Card'];

const state = { customers: [], subscriptions: [], payments: [], reminders: [], plans: [], seq: 0 };

function seed() {
  const t = todayISO();
  // expiry offsets chosen to populate every dashboard/renewal bucket.
  const spec = [
    { off: -8, paid: 1.0, act: 'Approved', renewed: true },
    { off: -3, paid: 0.5, act: 'Approved', renewed: false },
    { off: -1, paid: 0, act: 'Approved', renewed: false },
    { off: 0, paid: 0.4, act: 'Approved', renewed: false },
    { off: 0, paid: 1.0, act: 'Approved', renewed: false },
    { off: 1, paid: 1.0, act: 'Approved', renewed: false },
    { off: 2, paid: 0.6, act: 'Approved', renewed: false },
    { off: 3, paid: 0, act: 'Pending Approval', renewed: false },
    { off: 5, paid: 1.0, act: 'Approved', renewed: false },
    { off: 7, paid: 0.7, act: 'Approved', renewed: false },
    { off: 10, paid: 1.0, act: 'Approved', renewed: false },
    { off: 20, paid: 1.0, act: 'Approved', renewed: false },
    { off: 35, paid: 1.0, act: 'Approved', renewed: false },
    { off: 60, paid: 1.0, act: 'Approved', renewed: false },
    { off: 90, paid: 1.0, act: 'Approved', renewed: false },
    { off: 45, paid: 1.2, act: 'Approved', renewed: false },
  ];
  state.seq = spec.length;
  spec.forEach((s, i) => {
    const plan = PLANS[i % PLANS.length];
    const expiry = addDays(t, s.off);
    const start = addDays(expiry, -30);
    const due = plan.default_price;
    const cust = {
      customer_id: uuid(),
      customer_code: 'CUST-' + pad(i + 1).padStart(4, '0'),
      full_name: NAMES[i % NAMES.length],
      phone_e164: '+9198' + pad(10000000 + i * 111111).slice(0, 8),
      joined_date: addDays(start, -120),
      notes: '',
      is_archived: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const sub = {
      subscription_id: uuid(),
      customer_id: cust.customer_id,
      plan_id: plan.plan_id,
      plan_name_snapshot: plan.plan_name,
      duration_value: plan.duration_value,
      duration_unit: plan.duration_unit,
      start_date: start,
      expiry_date: expiry,
      expiry_is_manual: false,
      amount_due: due,
      activation_status: s.act,
      previous_subscription_id: '',
      renewed_by_subscription_id: s.renewed ? uuid() : '',
      approved_by: s.act === 'Approved' ? 'RAMESH' : '',
      approved_at: s.act === 'Approved' ? new Date().toISOString() : '',
      cancelled_at: '',
      cancel_reason: '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const pay = money(due * s.paid);
    state.customers.push(cust);
    state.subscriptions.push(sub);
    if (pay > 0) {
      state.payments.push({
        payment_id: uuid(), customer_id: cust.customer_id, subscription_id: sub.subscription_id,
        entry_type: 'PAYMENT', amount: pay, payment_date: start, payment_method: METHODS[i % METHODS.length],
        transaction_reference: 'UPI' + (1000 + i), notes: '', created_at: new Date().toISOString(), created_by: 'RAMESH',
      });
    }
    // reminders for near-expiry subs
    if (s.off >= -3 && s.off <= 7 && !s.renewed) {
      const type = s.off === 0 ? 'expiryday' : s.off <= 3 ? '3day' : '7day';
      state.reminders.push({
        reminder_id: uuid(), customer_id: cust.customer_id, subscription_id: sub.subscription_id,
        reminder_type: type, scheduled_date: addDays(t, Math.max(0, s.off - (type === '7day' ? 7 : type === '3day' ? 3 : 0))),
        status: s.off <= 1 ? 'Pending' : 'WhatsApp Clicked', generated_at: new Date().toISOString(),
        whatsapp_clicked_at: s.off > 1 ? new Date().toISOString() : '', manually_marked_sent_at: '',
        followup_status: 'None', notes: '', dedupe_key: sub.subscription_id + '|' + type,
      });
    }
  });
  state.plans = PLANS.map((p, i) => ({ ...p, default_price: p.default_price, is_active: true, display_order: i + 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }));
}
seed();

function netPaid(subId) {
  return money(state.payments.filter((p) => p.subscription_id === subId).reduce((s, p) => s + (p.entry_type === 'REFUND' ? -p.amount : p.amount), 0));
}
function payStatus(due, paid) {
  if (due <= 0) return 'Paid';
  if (paid >= due) return paid > due ? 'Credit Balance' : 'Paid';
  if (paid > 0) return 'Partially Paid';
  return 'Unpaid';
}
function dateStatus(s) {
  if (s.activation_status === 'Cancelled') return 'Cancelled';
  const t = todayISO();
  if (s.expiry_date < t) return 'Expired';
  if (s.start_date > t) return 'Upcoming';
  return 'Active';
}
function decoSub(s) {
  const paid = netPaid(s.subscription_id);
  const due = s.amount_due;
  return { ...s, plan_name: s.plan_name_snapshot, net_paid: paid, amount_paid: paid, outstanding: money(Math.max(0, due - paid)), credit: money(Math.max(0, paid - due)), payment_status: payStatus(due, paid), date_status: dateStatus(s), is_active: s.activation_status === 'Approved' && s.start_date <= todayISO() && s.expiry_date >= todayISO() };
}
function currentSub(custId) {
  const subs = state.subscriptions.filter((s) => s.customer_id === custId).map(decoSub);
  const active = subs.filter((s) => s.is_active).sort((a, b) => (a.start_date < b.start_date ? 1 : -1));
  if (active.length) return active[0];
  const nc = subs.filter((s) => s.activation_status !== 'Cancelled').sort((a, b) => (a.expiry_date < b.expiry_date ? 1 : -1));
  return nc[0] || null;
}
function decoCustomer(c) {
  const cur = currentSub(c.customer_id);
  return {
    ...c, is_archived: !!c.is_archived,
    current_plan: cur ? cur.plan_name : '', subscription_start: cur ? cur.start_date : '',
    expiry_date: cur ? cur.expiry_date : '', subscription_amount: cur ? cur.amount_due : 0,
    amount_paid: cur ? cur.amount_paid : 0, outstanding: cur ? cur.outstanding : 0,
    payment_status: cur ? cur.payment_status : '', activation_status: cur ? cur.activation_status : '',
    date_status: cur ? cur.date_status : (c.is_archived ? 'Archived' : 'No Subscription'),
    days_to_expiry: cur ? daysFromToday(cur.expiry_date) : null,
  };
}

const TEMPLATES = {
  '7day': 'Hi {{customer_name}},\n\nYour subscription for our stock market calls group is due for renewal on {{expiry_date}}.\n\nPlease plan your renewal to continue receiving our market updates.\n\nThank you.',
  '3day': 'Hi {{customer_name}},\n\nJust a reminder that your subscription expires on {{expiry_date}}.\n\nPlease complete your renewal to continue receiving our market updates.\n\nThank you.',
  expiryday: 'Hi {{customer_name}},\n\nYour subscription expires today.\n\nPlease renew to continue receiving our market updates.\n\nThank you.',
  expired: 'Hi {{customer_name}},\n\nYour subscription expired on {{expiry_date}}.\n\nPlease contact us for renewal if you would like to continue receiving our updates.\n\nThank you.',
  manual: 'Hi {{customer_name}},\n\nThis is a friendly reminder about your subscription (renews/expires on {{expiry_date}}).\n\nThank you.',
};
function renderTpl(t, v) { return String(t).replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => (v[k] == null ? '' : v[k])); }
function fmtDate(s) { const d = new Date(s + 'T00:00:00'); return `${pad(d.getDate())} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()]} ${d.getFullYear()}`; }
function waUrl(phone, msg) { return 'https://wa.me/' + String(phone).replace(/\D+/g, '') + (msg ? '?text=' + encodeURIComponent(msg) : ''); }

function delay(v) { return new Promise((r) => setTimeout(() => r(v), 120)); }
function fail(code, message, details) { return new Promise((_, rej) => setTimeout(() => rej(new ApiError({ code, message, details })), 120)); }

function computeDashboard() {
  const t = todayISO();
  const subs = state.subscriptions;
  const custs = state.customers;
  const activeMembers = new Set(subs.filter((s) => decoSub(s).is_active).map((s) => s.customer_id));
  const revenueMtd = money(state.payments.filter((p) => p.payment_date.slice(0, 7) === t.slice(0, 7)).reduce((s, p) => s + (p.entry_type === 'REFUND' ? -p.amount : p.amount), 0));
  const outstanding = money(subs.filter((s) => s.activation_status !== 'Cancelled').reduce((s, x) => s + decoSub(x).outstanding, 0));
  const in7 = addDays(t, 7);
  const expiring7 = new Set(subs.filter((s) => s.activation_status === 'Approved' && !s.renewed_by_subscription_id && s.expiry_date >= t && s.expiry_date <= in7).map((s) => s.customer_id));
  const expired = subs.filter((s) => s.activation_status !== 'Cancelled' && !s.renewed_by_subscription_id && s.expiry_date < t).length;
  const dist = { 'Paid': 0, 'Partially Paid': 0, 'Unpaid': 0, 'Credit Balance': 0 };
  subs.filter((s) => s.activation_status !== 'Cancelled').forEach((s) => { const d = decoSub(s); dist[d.payment_status] = (dist[d.payment_status] || 0) + 1; });
  const daily = [];
  for (let i = 0; i < 30; i++) { const day = addDays(t, i); daily.push({ date: day, label: fmtDate(day), count: subs.filter((s) => !s.renewed_by_subscription_id && s.activation_status !== 'Cancelled' && s.expiry_date === day).length }); }
  const trend = [];
  for (let i = 5; i >= 0; i--) { const d = new Date(t + 'T00:00:00'); d.setMonth(d.getMonth() - i); const mk = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; trend.push({ month: mk, label: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()] + ' ' + d.getFullYear(), revenue: money(state.payments.filter((p) => p.payment_date.slice(0, 7) === mk).reduce((s, p) => s + (p.entry_type === 'REFUND' ? -p.amount : p.amount), 0)) }); }
  return {
    generated_on: t, range: '30d', greeting_name: 'RAMESH', business_name: 'SUBSCRIPTION HUB', currency_symbol: '₹', setup_complete: true,
    kpis: { active_members: activeMembers.size, active_subscriptions: subs.filter((s) => decoSub(s).is_active).length, revenue_mtd: revenueMtd, outstanding_balance: outstanding, expiring_7_days: expiring7.size, expired_subscriptions: expired, revenue_in_range: revenueMtd, new_customers_in_range: 3, total_customers: custs.filter((c) => !c.is_archived).length },
    capacity: { active: custs.filter((c) => !c.is_archived).length, capacity: 500, remaining: 500 - custs.filter((c) => !c.is_archived).length, atLimit: false },
    analytics: { renewal_forecast: { daily, total: daily.reduce((s, d) => s + d.count, 0) }, revenue_trend: trend, payment_distribution: dist },
    action_queue: { renewals_today: subs.filter((s) => !s.renewed_by_subscription_id && s.activation_status !== 'Cancelled' && s.expiry_date === t).length, renewals_3days: subs.filter((s) => !s.renewed_by_subscription_id && s.activation_status !== 'Cancelled' && s.expiry_date >= t && s.expiry_date <= addDays(t, 3)).length, renewals_7days: expiring7.size, expired_customers: new Set(subs.filter((s) => s.activation_status !== 'Cancelled' && !s.renewed_by_subscription_id && s.expiry_date < t).map((s) => s.customer_id)).size, pending_approvals: subs.filter((s) => s.activation_status === 'Pending Approval').length, pending_payment_balances: subs.filter((s) => s.activation_status !== 'Cancelled' && decoSub(s).outstanding > 0).length, followups_pending: state.reminders.filter((r) => r.followup_status === 'Pending').length },
    recent_activity: [
      { audit_id: uuid(), entity_type: 'Customer', entity_id: '', action: 'CREATE', after: { full_name: NAMES[0] }, performed_by: 'RAMESH', timestamp: new Date(Date.now() - 3600000).toISOString() },
      { audit_id: uuid(), entity_type: 'Payment', entity_id: '', action: 'PAYMENT', after: { amount: 1000 }, performed_by: 'RAMESH', timestamp: new Date(Date.now() - 7200000).toISOString() },
      { audit_id: uuid(), entity_type: 'Subscription', entity_id: '', action: 'RENEW', after: { plan: 'Quarterly' }, performed_by: 'RAMESH', timestamp: new Date(Date.now() - 10800000).toISOString() },
    ],
  };
}

export function mockReset() { /* no-op for dev */ }

export function mockRun(fn, args) {
  const [token, ...rest] = args;
  switch (fn) {
    case 'apiLogin': return delay({ token: 'mock-token', mustChangePassword: false, loginId: (args[0] || 'RAMESH') });
    case 'apiLogout': return delay(true);
    case 'apiGetSession': return delay({ loginId: 'RAMESH', mustChangePassword: false, expiresAt: new Date(Date.now() + 36000000).toISOString(), ttlHours: 12 });
    case 'apiChangePassword': return delay(true);
    case 'apiChangeLoginId': return delay({ loginId: args[0] });
    case 'apiGetDashboard': return delay(computeDashboard());
    case 'apiListCustomers': {
      const p = rest[0] || {};
      let items = state.customers.map(decoCustomer);
      if (p.search) { const q = p.search.toLowerCase(); items = items.filter((c) => c.full_name.toLowerCase().includes(q) || c.phone_e164.includes(q) || c.customer_code.toLowerCase().includes(q)); }
      if (p.include_archived !== true) items = items.filter((c) => !c.is_archived);
      if (p.status) items = items.filter((c) => c.date_status === p.status);
      if (p.has_outstanding === true) items = items.filter((c) => c.outstanding > 0);
      items.sort((a, b) => (a.expiry_date < b.expiry_date ? -1 : 1));
      const page = p.page || 1; const size = p.page_size || 25;
      return delay({ items: items.slice((page - 1) * size, page * size), total: items.length, page, page_size: size, capacity: { active: state.customers.filter((c) => !c.is_archived).length, capacity: 500, remaining: 500 - state.customers.filter((c) => !c.is_archived).length, atLimit: false } });
    }
    case 'apiGetCapacity': return delay({ active: state.customers.length, capacity: 500, remaining: 500 - state.customers.length, atLimit: false });
    case 'apiCheckDuplicatePhone': return delay({ exists: false });
    case 'apiGetCustomerProfile': {
      const c = state.customers.find((x) => x.customer_id === rest[0]);
      if (!c) return fail('NOT_FOUND', 'Customer not found.');
      const subs = state.subscriptions.filter((s) => s.customer_id === c.customer_id).map(decoSub).sort((a, b) => (a.start_date < b.start_date ? 1 : -1));
      const pays = state.payments.filter((p) => p.customer_id === c.customer_id).sort((a, b) => (a.payment_date < b.payment_date ? 1 : -1));
      const rems = state.reminders.filter((r) => r.customer_id === c.customer_id);
      const lifetime = money(pays.reduce((s, p) => s + (p.entry_type === 'REFUND' ? -p.amount : p.amount), 0));
      const active = subs.filter((s) => s.is_active).sort((a, b) => (a.start_date < b.start_date ? 1 : -1));
      const nc = subs.filter((s) => s.activation_status !== 'Cancelled').sort((a, b) => (a.expiry_date < b.expiry_date ? 1 : -1));
      const cur = active[0] || nc[0] || null;
      const upcoming = subs.filter((s) => s.start_date > todayISO()).sort((a, b) => (a.start_date > b.start_date ? 1 : -1))[0] || null;
      return delay({ customer: { ...decoCustomer(c), current_subscription: cur, next_subscription: upcoming }, subscriptions: subs, payments: pays, reminders: rems, lifetime: { total_payments: lifetime, total_refunds: 0, net_collected: lifetime, outstanding: cur ? cur.outstanding : 0 }, activity: [] });
    }
    case 'apiCreateCustomer': {
      const input = rest[0] || {};
      state.seq += 1;
      const c = { customer_id: uuid(), customer_code: 'CUST-' + pad(state.seq).padStart(4, '0'), full_name: input.full_name || 'New Customer', phone_e164: input.phone || '+919000000000', joined_date: input.joined_date || todayISO(), notes: input.notes || '', is_archived: false, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      const due = Number(input.amount_due || 0); const rec = Number(input.amount_received || 0);
      const s = { subscription_id: uuid(), customer_id: c.customer_id, plan_id: input.plan_id || 'p1', plan_name_snapshot: input.plan_name || 'Monthly', duration_value: 1, duration_unit: 'MONTH', start_date: input.start_date || todayISO(), expiry_date: input.expiry_date || addDays(todayISO(), 30), expiry_is_manual: false, amount_due: due, activation_status: (due <= 0 || rec >= due) ? 'Approved' : 'Pending Approval', previous_subscription_id: '', renewed_by_subscription_id: '', approved_by: '', approved_at: '', cancelled_at: '', cancel_reason: '', created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      state.customers.push(c); state.subscriptions.push(s);
      let pay = null;
      if (rec > 0) { pay = { payment_id: uuid(), customer_id: c.customer_id, subscription_id: s.subscription_id, entry_type: 'PAYMENT', amount: rec, payment_date: input.payment_date || todayISO(), payment_method: input.payment_method || 'UPI', transaction_reference: '', notes: '', created_at: new Date().toISOString(), created_by: 'RAMESH' }; state.payments.push(pay); }
      return delay({ customer: decoCustomer(c), subscription: decoSub(s), payment: pay });
    }
    case 'apiUpdateCustomer': {
      const c = state.customers.find((x) => x.customer_id === rest[0]);
      if (c) Object.assign(c, rest[1] || {});
      return delay(c);
    }
    case 'apiArchiveCustomer': {
      const c = state.customers.find((x) => x.customer_id === rest[0]);
      if (c) c.is_archived = !!rest[1];
      return delay({ customer_id: rest[0], is_archived: !!rest[1] });
    }
    case 'apiListSubscriptions': {
      const f = rest[0] || {};
      let items = state.subscriptions.map(decoSub);
      if (f.customer_id) items = items.filter((s) => s.customer_id === f.customer_id);
      if (f.activation_status) items = items.filter((s) => s.activation_status === f.activation_status);
      items.sort((a, b) => (a.expiry_date < b.expiry_date ? -1 : 1));
      return delay(items.slice(0, f.limit || 500));
    }
    case 'apiRenewSubscription':
    case 'apiCreateSubscription': {
      const input = rest[0] || {};
      const prev = state.subscriptions.find((s) => s.subscription_id === input.previous_subscription_id);
      const custId = (prev && prev.customer_id) || input.customer_id;
      const s = { subscription_id: uuid(), customer_id: custId, plan_id: input.plan_id || 'p1', plan_name_snapshot: input.plan_name || 'Monthly', duration_value: 1, duration_unit: 'MONTH', start_date: input.start_date || todayISO(), expiry_date: input.expiry_date || addDays(todayISO(), 30), expiry_is_manual: false, amount_due: Number(input.amount_due || 0), activation_status: 'Approved', previous_subscription_id: input.previous_subscription_id || '', renewed_by_subscription_id: '', approved_by: 'RAMESH', approved_at: new Date().toISOString(), cancelled_at: '', cancel_reason: '', created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      state.subscriptions.push(s);
      if (prev) prev.renewed_by_subscription_id = s.subscription_id;
      if (Number(input.amount_received) > 0) state.payments.push({ payment_id: uuid(), customer_id: custId, subscription_id: s.subscription_id, entry_type: 'PAYMENT', amount: Number(input.amount_received), payment_date: todayISO(), payment_method: input.payment_method || 'UPI', transaction_reference: '', notes: 'Renewal', created_at: new Date().toISOString(), created_by: 'RAMESH' });
      return delay(decoSub(s));
    }
    case 'apiApproveSubscription': { const s = state.subscriptions.find((x) => x.subscription_id === rest[0]); if (s) { s.activation_status = 'Approved'; s.approved_by = 'RAMESH'; s.approved_at = new Date().toISOString(); } return delay(decoSub(s)); }
    case 'apiCancelSubscription': { const s = state.subscriptions.find((x) => x.subscription_id === rest[0]); if (s) { s.activation_status = 'Cancelled'; s.cancel_reason = rest[1] || ''; } return delay(decoSub(s)); }
    case 'apiRecordPayment': {
      const input = rest[0] || {};
      const p = { payment_id: uuid(), customer_id: input.customer_id, subscription_id: input.subscription_id, entry_type: input.entry_type || 'PAYMENT', amount: Number(input.amount || 0), payment_date: input.payment_date || todayISO(), payment_method: input.payment_method || 'UPI', transaction_reference: input.transaction_reference || '', notes: input.notes || '', created_at: new Date().toISOString(), created_by: 'RAMESH' };
      state.payments.push(p); return delay(p);
    }
    case 'apiListPayments': {
      const f = rest[0] || {};
      let items = state.payments.slice();
      if (f.customer_id) items = items.filter((p) => p.customer_id === f.customer_id);
      if (f.subscription_id) items = items.filter((p) => p.subscription_id === f.subscription_id);
      items.sort((a, b) => (a.payment_date < b.payment_date ? 1 : -1));
      return delay(items.slice(0, f.limit || 300));
    }
    case 'apiGetRenewals': {
      const view = rest[0] || 'upcoming';
      const t = todayISO();
      let items = state.subscriptions.map((s) => { const d = decoSub(s); const c = state.customers.find((x) => x.customer_id === s.customer_id) || {}; const rem = state.reminders.filter((r) => r.subscription_id === s.subscription_id).sort((a, b) => (a.scheduled_date < b.scheduled_date ? 1 : -1))[0]; return { subscription_id: s.subscription_id, customer_id: s.customer_id, customer_name: c.full_name || '', customer_code: c.customer_code || '', phone_e164: c.phone_e164 || '', plan_name: d.plan_name, start_date: s.start_date, expiry_date: s.expiry_date, days_remaining: daysFromToday(s.expiry_date), subscription_amount: d.amount_due, outstanding: d.outstanding, payment_status: d.payment_status, activation_status: d.activation_status, date_status: d.date_status, is_archived: !!c.is_archived, renewed: !!s.renewed_by_subscription_id, reminder_id: rem ? rem.reminder_id : '', reminder_status: rem ? rem.status : 'None', reminder_type: rem ? rem.reminder_type : '', followup_status: rem ? rem.followup_status : 'None' }; });
      items = items.filter((i) => !i.is_archived);
      const nd = (i) => !i.renewed && i.activation_status !== 'Cancelled';
      if (view === 'today') items = items.filter((i) => i.expiry_date === t && nd(i));
      else if (view === '3days') items = items.filter((i) => i.expiry_date >= t && i.expiry_date <= addDays(t, 3) && nd(i));
      else if (view === '7days') items = items.filter((i) => i.expiry_date >= t && i.expiry_date <= addDays(t, 7) && nd(i));
      else if (view === 'overdue') items = items.filter((i) => i.expiry_date < t && nd(i));
      else if (view === 'renewed') items = items.filter((i) => i.renewed);
      else items = items.filter((i) => i.expiry_date >= t && nd(i));
      items.sort((a, b) => (a.expiry_date > b.expiry_date ? 1 : -1));
      return delay({ view, generated_on: t, count: items.length, items });
    }
    case 'apiGetCalendarEvents': {
      const p = rest[0] || {}; const view = p.view || 'month'; const anchor = p.anchor || todayISO();
      const t = todayISO();
      const d0 = new Date(anchor + 'T00:00:00');
      let from, to;
      if (view === 'day') { from = anchor; to = anchor; }
      else if (view === 'week') { const dow = (d0.getDay() + 6) % 7; const mon = addDays(anchor, -dow); from = mon; to = addDays(mon, 6); }
      else { d0.setDate(1); from = iso(d0); const nd = new Date(d0); nd.setMonth(nd.getMonth() + 1); nd.setDate(0); to = iso(nd); }
      const events = [];
      state.subscriptions.forEach((s) => { if (s.renewed_by_subscription_id) return; if (s.expiry_date < from || s.expiry_date > to) return; const c = state.customers.find((x) => x.customer_id === s.customer_id) || {}; const dd = decoSub(s); let color = 'green'; if (s.activation_status === 'Cancelled' || c.is_archived) color = 'grey'; else if (s.expiry_date < t) color = 'red'; else if (s.expiry_date === t) color = 'orange'; else if (daysFromToday(s.expiry_date) <= 7) color = 'yellow'; events.push({ date: s.expiry_date, subscription_id: s.subscription_id, customer_id: s.customer_id, customer_name: c.full_name || '', customer_code: c.customer_code || '', phone_e164: c.phone_e164 || '', plan_name: dd.plan_name, expiry_date: s.expiry_date, days_remaining: daysFromToday(s.expiry_date), outstanding: dd.outstanding, amount_due: dd.amount_due, payment_status: dd.payment_status, activation_status: s.activation_status, color }); });
      const byDate = {}; events.forEach((e) => { (byDate[e.date] = byDate[e.date] || []).push(e); });
      const days = []; for (let cur = from; cur <= to; cur = addDays(cur, 1)) { const list = byDate[cur] || []; days.push({ date: cur, label: fmtDate(cur), is_today: cur === t, is_past: cur < t, count: list.length, events: list }); }
      return delay({ view, anchor, range: { from, to }, generated_on: t, days, list: events.sort((a, b) => (a.date > b.date ? 1 : -1)), total_events: events.length });
    }
    case 'apiGetReminderQueue': {
      const f = rest[0] || {}; const t = todayISO(); const in7 = addDays(t, 7);
      let items = state.reminders.map((r) => { const c = state.customers.find((x) => x.customer_id === r.customer_id) || {}; const s = state.subscriptions.find((x) => x.subscription_id === r.subscription_id) || {}; return { ...r, customer_name: c.full_name || '', customer_code: c.customer_code || '', phone_e164: c.phone_e164 || '', plan_name: s.plan_name_snapshot || '', expiry_date: s.expiry_date || '', is_archived: !!c.is_archived, renewed: !!s.renewed_by_subscription_id }; }).filter((i) => !i.is_archived);
      const COMPLETED = ['Manually Marked Sent', 'Renewed', 'Not Renewing'];
      const b = f.bucket;
      if (b === 'today') items = items.filter((i) => i.scheduled_date === t);
      else if (b === 'thisweek') items = items.filter((i) => i.scheduled_date >= t && i.scheduled_date <= in7);
      else if (b === 'overdue') items = items.filter((i) => i.scheduled_date < t && i.status === 'Pending');
      else if (b === 'notcontacted') items = items.filter((i) => i.status === 'Pending');
      else if (b === 'followuppending') items = items.filter((i) => i.followup_status === 'Pending');
      else if (b === 'completed') items = items.filter((i) => COMPLETED.includes(i.status));
      items.sort((a, b) => (a.scheduled_date > b.scheduled_date ? 1 : -1));
      return delay({ generated_on: t, count: items.length, items });
    }
    case 'apiMarkReminderSent': { const r = state.reminders.find((x) => x.reminder_id === rest[0]); if (r) { r.status = 'Manually Marked Sent'; r.manually_marked_sent_at = new Date().toISOString(); } return delay({ reminder_id: rest[0], status: 'Manually Marked Sent' }); }
    case 'apiLogReminderClick': { const r = state.reminders.find((x) => x.reminder_id === rest[0]); if (r && r.status === 'Pending') r.status = 'WhatsApp Clicked'; if (r) r.whatsapp_clicked_at = new Date().toISOString(); return delay({ reminder_id: rest[0] }); }
    case 'apiSaveFollowUp': { const r = state.reminders.find((x) => x.reminder_id === rest[0]); if (r) Object.assign(r, rest[1] || {}); return delay({ reminder_id: rest[0] }); }
    case 'apiEnsureReminders': return delay({ created: 0 });
    case 'apiComposeReminderWhatsApp': { const r = state.reminders.find((x) => x.reminder_id === rest[0]); const c = state.customers.find((x) => x.customer_id === (r && r.customer_id)) || {}; const s = state.subscriptions.find((x) => x.subscription_id === (r && r.subscription_id)) || {}; const type = (r && r.reminder_type) || 'manual'; const msg = renderTpl(TEMPLATES[type] || TEMPLATES.manual, { customer_name: c.full_name, expiry_date: fmtDate(s.expiry_date), business_name: 'SUBSCRIPTION HUB' }); return delay({ url: waUrl(c.phone_e164, msg), phone: c.phone_e164, phone_digits: String(c.phone_e164).replace(/\D+/g, ''), message: msg, type, reminder_id: rest[0] }); }
    case 'apiComposeCustomerWhatsApp': { const c = state.customers.find((x) => x.customer_id === rest[0]) || {}; const cur = currentSub(c.customer_id); const type = rest[1] || '7day'; const msg = renderTpl(TEMPLATES[type] || TEMPLATES.manual, { customer_name: c.full_name, expiry_date: cur ? fmtDate(cur.expiry_date) : '', business_name: 'SUBSCRIPTION HUB' }); return delay({ url: waUrl(c.phone_e164, msg), phone: c.phone_e164, phone_digits: String(c.phone_e164).replace(/\D+/g, ''), message: msg, type, subscription_id: cur ? cur.subscription_id : '' }); }
    case 'apiGetWhatsAppTemplates': return delay(TEMPLATES);
    case 'apiSearch': { const q = String(rest[0] || '').toLowerCase(); const customers = state.customers.filter((c) => c.full_name.toLowerCase().includes(q) || c.phone_e164.includes(q) || c.customer_code.toLowerCase().includes(q)).slice(0, 10).map((c) => ({ customer_id: c.customer_id, customer_code: c.customer_code, full_name: c.full_name, phone_e164: c.phone_e164, is_archived: !!c.is_archived })); const subscriptions = state.subscriptions.filter((s) => s.subscription_id.includes(q)).slice(0, 10).map((s) => { const c = state.customers.find((x) => x.customer_id === s.customer_id) || {}; return { subscription_id: s.subscription_id, customer_id: s.customer_id, customer_name: c.full_name || '', plan_name: s.plan_name_snapshot, expiry_date: s.expiry_date }; }); return delay({ query: rest[0] || '', customers, subscriptions }); }
    case 'apiGetReports': { const t = todayISO(); const subs = state.subscriptions; const lifetime = money(state.payments.reduce((s, p) => s + (p.entry_type === 'REFUND' ? -p.amount : p.amount), 0)); const byMethod = {}; state.payments.forEach((p) => { byMethod[p.payment_method || 'Unspecified'] = money((byMethod[p.payment_method || 'Unspecified'] || 0) + p.amount); }); return delay({ generated_on: t, currency_symbol: '₹', revenue: { today: money(state.payments.filter((p) => p.payment_date === t).reduce((s, p) => s + p.amount, 0)), this_month: lifetime, last_month: money(lifetime * 0.8), lifetime_collections: lifetime, by_method: byMethod, trend: computeDashboard().analytics.revenue_trend }, subscriptions: { active: subs.filter((s) => decoSub(s).is_active).length, new_customers_today: 1, renewals_completed: subs.filter((s) => s.previous_subscription_id).length + 1, upcoming_renewals: subs.filter((s) => s.activation_status !== 'Cancelled' && !s.renewed_by_subscription_id && s.expiry_date >= t).length, expired: subs.filter((s) => s.activation_status !== 'Cancelled' && !s.renewed_by_subscription_id && s.expiry_date < t).length, repeat_customers: 2 }, outstanding: { partially_paid: subs.filter((s) => decoSub(s).payment_status === 'Partially Paid').length, unpaid: subs.filter((s) => decoSub(s).payment_status === 'Unpaid').length, outstanding_total: money(subs.reduce((s, x) => s + decoSub(x).outstanding, 0)), overdue_count: subs.filter((s) => decoSub(s).outstanding > 0 && s.expiry_date < t).length, overdue_total: money(subs.filter((s) => decoSub(s).outstanding > 0 && s.expiry_date < t).reduce((s, x) => s + decoSub(x).outstanding, 0)) } }); }
    case 'apiExportCsv': return delay({ filename: 'export.csv', csv: 'col1,col2\nvalue1,value2\n' });
    case 'apiGetSettings': return delay({ business_name: 'SUBSCRIPTION HUB', currency: 'INR', currency_symbol: '₹', default_country_code: '91', timezone: 'Asia/Kolkata', customer_capacity: '500', reminder_enabled: 'true', reminder_days_before: '7,3,0', reminder_hour: '9', whatsapp_template_7day: TEMPLATES['7day'], whatsapp_template_3day: TEMPLATES['3day'], whatsapp_template_expiryday: TEMPLATES.expiryday, whatsapp_template_expired: TEMPLATES.expired, schema_version: '1', spreadsheet_url: 'https://docs.google.com/spreadsheets/d/demo' });
    case 'apiUpdateSettings': return delay(true);
    case 'apiListPlans': return delay(state.plans);
    case 'apiCreatePlan': { const p = { plan_id: uuid(), ...(rest[0] || {}), is_active: true, display_order: state.plans.length + 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }; state.plans.push(p); return delay(p); }
    case 'apiUpdatePlan': { const p = state.plans.find((x) => x.plan_id === rest[0]); if (p) Object.assign(p, rest[1] || {}); return delay(p); }
    case 'apiDeactivatePlan': { const p = state.plans.find((x) => x.plan_id === rest[0]); if (p) p.is_active = false; return delay(p); }
    case 'apiGetAudit': return delay([]);
    case 'apiCreateBackup': return delay({ url: 'https://drive.google.com/demo-backup', name: 'Backup', created_at: new Date().toISOString() });
    case 'apiGetTriggerStatus': return delay({ reminder_trigger: { event: 'daily', hour: 9 }, backup_trigger: { event: 'weekly (Sunday 02:00)' }, installed: true });
    case 'apiInstallReminderTrigger': return delay(true);
    default: return delay(null);
  }
}
