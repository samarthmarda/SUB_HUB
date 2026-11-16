// Smoke test: exercise the dev mock's endpoints (the same data the live preview
// renders) to catch contract/runtime errors without a browser. The source uses
// extensionless imports (a bundler concern), so we bundle the mock with esbuild
// (already present via Vite) before importing it in Node.
import esbuild from 'esbuild';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const outfile = join(tmpdir(), 'subhub-mock-bundle.mjs');
await esbuild.build({
  entryPoints: ['src/lib/mock.js'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile,
  logLevel: 'silent',
});
const { mockRun } = await import(pathToFileURL(outfile).href);

let failures = 0;
function check(name, cond) {
  if (cond) console.log('  ok  ' + name);
  else { console.log('  FAIL ' + name); failures++; }
}

const call = (fn, args = []) => mockRun(fn, args);

const login = await call('apiLogin', ['RAMESH', 'JSK']);
check('apiLogin returns token', !!login.token);

const dash = await call('apiGetDashboard', ['t', '30d']);
check('dashboard kpis', !!dash.kpis && typeof dash.kpis.active_members === 'number');
check('dashboard analytics', !!dash.analytics.renewal_forecast && !!dash.analytics.revenue_trend);
check('dashboard action_queue', !!dash.action_queue);
check('dashboard recent_activity array', Array.isArray(dash.recent_activity));

const custs = await call('apiListCustomers', ['t', { page: 1, page_size: 25 }]);
check('listCustomers items array', Array.isArray(custs.items) && custs.items.length > 0);
const cid = custs.items[0].customer_id;

const prof = await call('apiGetCustomerProfile', ['t', cid]);
check('profile customer', !!prof.customer && !!prof.customer.full_name);
check('profile subscriptions', Array.isArray(prof.subscriptions));
check('profile payments', Array.isArray(prof.payments));

const subs = await call('apiListSubscriptions', ['t', { limit: 100 }]);
check('listSubscriptions', Array.isArray(subs) && subs.length > 0);
const sid = subs[0].subscription_id;

const ren = await call('apiGetRenewals', ['t', 'upcoming']);
check('renewals items', Array.isArray(ren.items));

const cal = await call('apiGetCalendarEvents', ['t', { view: 'month', anchor: new Date().toISOString().slice(0, 10) }]);
check('calendar days', Array.isArray(cal.days) && cal.days.length >= 28);

const rem = await call('apiGetReminderQueue', ['t', {}]);
check('reminder queue items', Array.isArray(rem.items));

const pays = await call('apiListPayments', ['t', {}]);
check('payments array', Array.isArray(pays));

const rep = await call('apiGetReports', ['t', '30d']);
check('reports revenue', !!rep.revenue && !!rep.outstanding);

const set = await call('apiGetSettings', ['t']);
check('settings business_name', !!set.business_name);

const plans = await call('apiListPlans', ['t']);
check('plans array', Array.isArray(plans) && plans.length >= 4);

const search = await call('apiSearch', ['t', 'a']);
check('search customers', Array.isArray(search.customers));

const cwa = await call('apiComposeCustomerWhatsApp', ['t', cid, '7day']);
check('compose customer wa url', /^https:\/\/wa\.me\/\d+\?text=/.test(cwa.url));

const rwa = await call('apiComposeReminderWhatsApp', ['t', rem.items[0] ? rem.items[0].reminder_id : 'x']);
check('compose reminder wa url', !!rwa.url && rwa.url.startsWith('https://wa.me/'));

const tpl = await call('apiGetWhatsAppTemplates', ['t']);
check('whatsapp templates', !!tpl['7day'] && !!tpl.expired);

check('trigger status', !!(await call('apiGetTriggerStatus', ['t'])).installed);
check('capacity', !!(await call('apiGetCapacity', ['t'])).capacity);

const created = await call('apiCreateCustomer', ['t', { full_name: 'Test User', phone: '9812345678', amount_due: 1000, amount_received: 500, plan_id: 'p1', plan_name: 'Monthly', start_date: new Date().toISOString().slice(0, 10), expiry_date: '2099-01-01' }]);
check('createCustomer', !!created.customer && created.subscription.activation_status === 'Pending Approval');

const pay = await call('apiRecordPayment', ['t', { customer_id: created.customer.customer_id, subscription_id: created.subscription.subscription_id, amount: 500, entry_type: 'PAYMENT' }]);
check('recordPayment', !!pay.payment_id);

const renewed = await call('apiRenewSubscription', ['t', { previous_subscription_id: created.subscription.subscription_id, plan_id: 'p2', plan_name: 'Quarterly', duration_value: 3, duration_unit: 'MONTH', amount_due: 2700, amount_received: 2700, start_date: new Date().toISOString().slice(0, 10), expiry_date: '2099-06-01' }]);
check('renewSubscription links previous', renewed.previous_subscription_id === created.subscription.subscription_id);

const csv = await call('apiExportCsv', ['t', 'customers']);
check('exportCsv', typeof csv.csv === 'string' && csv.csv.length > 0 && !!csv.filename);

console.log(`\nMock smoke: ${failures === 0 ? 'ALL PASS' : failures + ' FAILURES'}`);
process.exit(failures === 0 ? 0 : 1);
