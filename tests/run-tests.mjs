#!/usr/bin/env node
/**
 * SUBSCRIPTION HUB — unit tests for pure business logic.
 *
 * We evaluate the REAL Apps Script source files (Utils, Validators, PaymentService,
 * SubscriptionService, WhatsAppService, Auth) inside a Node vm with a mocked
 * `Utilities` (SHA-256 via node:crypto) so we test production code, not a copy.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const GAS = join(__dirname, '..', 'apps-script');

function loadGas() {
  const files = ['Utils.gs', 'Validators.gs', 'PaymentService.gs', 'SubscriptionService.gs', 'WhatsAppService.gs', 'Auth.gs'];
  const sandbox = {
    console,
    Date,
    Math,
    JSON,
    Object,
    Array,
    Error,
    isFinite,
    parseInt,
    parseFloat,
    encodeURIComponent,
    decodeURIComponent,
    Utilities: {
      DigestAlgorithm: { SHA_256: 'SHA_256' },
      Charset: { UTF8: 'UTF8' },
      getUuid() {
        return crypto.randomUUID();
      },
      computeDigest(algo, input) {
        const data = Array.isArray(input) ? Buffer.from(input) : Buffer.from(String(input), 'utf8');
        return Array.from(crypto.createHash('sha256').update(data).digest());
      },
      formatDate(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
      },
    },
  };
  vm.createContext(sandbox);
  const src = files.map((f) => readFileSync(join(GAS, f), 'utf8')).join('\n');
  vm.runInContext(src, sandbox, { filename: 'bundle.gs' });
  return sandbox;
}

const G = loadGas();

// ---------------------------------------------------------------------------
// Date math
// ---------------------------------------------------------------------------
test('addDurationISO_ clamps month-end (non-leap)', () => {
  assert.equal(G.addDurationISO_('2026-01-31', 1, 'MONTH'), '2026-02-28');
});
test('addDurationISO_ handles leap February', () => {
  assert.equal(G.addDurationISO_('2024-01-31', 1, 'MONTH'), '2024-02-29');
  assert.equal(G.addDurationISO_('2028-02-29', 1, 'YEAR'), '2029-02-28');
});
test('addDurationISO_ three months from Nov 30', () => {
  assert.equal(G.addDurationISO_('2026-11-30', 3, 'MONTH'), '2027-02-28');
});
test('addDurationISO_ crosses year boundary', () => {
  assert.equal(G.addDurationISO_('2026-08-11', 6, 'MONTH'), '2027-02-11');
});
test('computeExpiryISO_ is inclusive (monthly)', () => {
  assert.equal(G.computeExpiryISO_('2026-11-01', 1, 'MONTH'), '2026-11-30');
  assert.equal(G.computeExpiryISO_('2026-11-01', 3, 'MONTH'), '2027-01-31');
});
test('computeExpiryISO_ daily = same day', () => {
  assert.equal(G.computeExpiryISO_('2026-11-01', 1, 'DAY'), '2026-11-01');
});
test('daysBetweenISO_ and addDaysISO_', () => {
  assert.equal(G.daysBetweenISO_('2026-11-25', '2026-11-30'), 5);
  assert.equal(G.addDaysISO_('2026-11-30', 1), '2026-12-01');
  assert.equal(G.addDaysISO_('2026-01-01', -1), '2025-12-31');
});
test('parseISO_ rejects invalid calendar dates', () => {
  assert.equal(G.parseISO_('2026-02-31'), null);
  assert.equal(G.parseISO_('not-a-date'), null);
  assert.ok(G.parseISO_('2026-02-28'));
});
test('formatDisplayDate_', () => {
  assert.equal(G.formatDisplayDate_('2026-11-30'), '30 Nov 2026');
});

// ---------------------------------------------------------------------------
// Phone normalisation
// ---------------------------------------------------------------------------
test('normalizePhoneE164_ Indian formats', () => {
  assert.equal(G.normalizePhoneE164_('9876543210'), '+919876543210');
  assert.equal(G.normalizePhoneE164_('+91 98765 43210'), '+919876543210');
  assert.equal(G.normalizePhoneE164_('09876543210'), '+919876543210');
  assert.equal(G.normalizePhoneE164_('919876543210'), '+919876543210');
  assert.equal(G.normalizePhoneE164_('(98765) 43210'), '+919876543210');
});
test('normalizePhoneE164_ rejects invalid', () => {
  assert.equal(G.normalizePhoneE164_('12345'), null);
  assert.equal(G.normalizePhoneE164_(''), null);
});
test('phoneForWhatsApp_ strips non-digits', () => {
  assert.equal(G.phoneForWhatsApp_('+919876543210'), '919876543210');
});

// ---------------------------------------------------------------------------
// Money / codes / dedupe
// ---------------------------------------------------------------------------
test('parseAmount_ and round2_', () => {
  assert.equal(G.parseAmount_('1,234.5'), 1234.5);
  assert.equal(G.parseAmount_(''), 0);
  assert.equal(G.parseAmount_(null), 0);
  assert.equal(G.round2_(10.005), 10.01);
});
test('formatCustomerCode_ and dedupeKey_', () => {
  assert.equal(G.formatCustomerCode_(1), 'CUST-0001');
  assert.equal(G.formatCustomerCode_(42), 'CUST-0042');
  assert.equal(G.dedupeKey_('sub1', '7day', '2026-11-30'), 'sub1|7day|2026-11-30');
});

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------
test('validatePhone_', () => {
  assert.equal(G.validatePhone_('9876543210').ok, true);
  assert.equal(G.validatePhone_('9876543210').e164, '+919876543210');
  assert.equal(G.validatePhone_('123').ok, false);
});
test('validateCustomerInput_ required fields', () => {
  const bad = G.validateCustomerInput_({ full_name: '', phone: '123' });
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.full_name);
  assert.ok(bad.errors.phone);
  const good = G.validateCustomerInput_({ full_name: 'Ramesh', phone: '9876543210' });
  assert.equal(good.ok, true);
  assert.equal(good.data.phone_e164, '+919876543210');
  assert.match(good.data.joined_date, /^\d{4}-\d{2}-\d{2}$/);
});
test('validateSubscriptionInput_ expiry before start fails', () => {
  const r = G.validateSubscriptionInput_({ plan_id: 'p', start_date: '2026-11-01', expiry_date: '2026-10-01', amount_due: '100' });
  assert.equal(r.ok, false);
  assert.ok(r.errors.expiry_date);
});
test('validatePaymentInput_ amount + method', () => {
  assert.equal(G.validatePaymentInput_({ amount: '0' }).ok, false);
  assert.equal(G.validatePaymentInput_({ amount: '500', payment_method: 'Barter' }).ok, false);
  assert.equal(G.validatePaymentInput_({ amount: '500', payment_method: 'UPI' }).ok, true);
});
test('validatePlanInput_', () => {
  assert.equal(G.validatePlanInput_({ plan_name: 'M', duration_value: 1, duration_unit: 'MONTH', default_price: '1000' }).ok, true);
  assert.equal(G.validatePlanInput_({ plan_name: 'M', duration_value: 0, duration_unit: 'MONTH' }).ok, false);
});

// ---------------------------------------------------------------------------
// Payment / subscription status logic
// ---------------------------------------------------------------------------
test('paymentStatusOf_', () => {
  assert.equal(G.paymentStatusOf_(1000, 1000), 'Paid');
  assert.equal(G.paymentStatusOf_(1000, 500), 'Partially Paid');
  assert.equal(G.paymentStatusOf_(1000, 0), 'Unpaid');
  assert.equal(G.paymentStatusOf_(1000, 1200), 'Credit Balance');
  assert.equal(G.paymentStatusOf_(0, 0), 'Paid');
});
test('outstandingOf_ / creditOf_', () => {
  assert.equal(G.outstandingOf_(1000, 400), 600);
  assert.equal(G.creditOf_(1000, 1200), 200);
  assert.equal(G.outstandingOf_(1000, 1200), 0);
});
test('subscriptionDateStatus_', () => {
  assert.equal(G.subscriptionDateStatus_({ activation_status: 'Approved', start_date: '2020-01-01', expiry_date: '2099-01-01' }), 'Active');
  assert.equal(G.subscriptionDateStatus_({ activation_status: 'Approved', start_date: '2020-01-01', expiry_date: '2000-01-01' }), 'Expired');
  assert.equal(G.subscriptionDateStatus_({ activation_status: 'Approved', start_date: '2099-01-01', expiry_date: '2099-06-01' }), 'Upcoming');
  assert.equal(G.subscriptionDateStatus_({ activation_status: 'Cancelled', start_date: '2020-01-01', expiry_date: '2099-01-01' }), 'Cancelled');
});
test('isApprovedActive_ requires approval + date range', () => {
  assert.equal(G.isApprovedActive_({ activation_status: 'Approved', start_date: '2020-01-01', expiry_date: '2099-01-01' }), true);
  assert.equal(G.isApprovedActive_({ activation_status: 'Pending Approval', start_date: '2020-01-01', expiry_date: '2099-01-01' }), false);
});
test('resolveExpiry_ server-side calc unless manual', () => {
  assert.equal(G.resolveExpiry_('2026-11-01', 1, 'MONTH', null, false), '2026-11-30');
  assert.equal(G.resolveExpiry_('2026-11-01', 1, 'MONTH', '2026-12-15', true), '2026-12-15');
});
test('resolveActivation_ rules', () => {
  assert.equal(G.resolveActivation_(1000, 1000, false, null), 'Approved');   // fully paid
  assert.equal(G.resolveActivation_(1000, 500, false, null), 'Pending Approval'); // partial
  assert.equal(G.resolveActivation_(1000, 500, true, null), 'Approved');     // explicit
  assert.equal(G.resolveActivation_(0, 0, false, null), 'Approved');         // zero due
});

// ---------------------------------------------------------------------------
// WhatsApp templates
// ---------------------------------------------------------------------------
test('renderTemplate_ substitutes + blanks', () => {
  assert.equal(G.renderTemplate_('Hi {{customer_name}}, expires {{expiry_date}}', { customer_name: 'Ram', expiry_date: '30 Nov 2026' }), 'Hi Ram, expires 30 Nov 2026');
  assert.equal(G.renderTemplate_('x{{missing}}y', {}), 'xy');
});
test('buildWhatsAppUrl_ encodes text, strips +', () => {
  assert.equal(G.buildWhatsAppUrl_('+919876543210', 'Hello World'), 'https://wa.me/919876543210?text=Hello%20World');
  assert.equal(G.buildWhatsAppUrl_('+919876543210', ''), 'https://wa.me/919876543210');
  assert.equal(G.buildWhatsAppUrl_('', 'hi'), '');
});

// ---------------------------------------------------------------------------
// Password hashing
// ---------------------------------------------------------------------------
test('hashPassword_ / verifyPassword_ round-trip', () => {
  const h = G.hashPassword_('JSK');
  const stored = G.encodePasswordHash_(h);
  assert.equal(G.verifyPassword_('JSK', stored), true);
  assert.equal(G.verifyPassword_('WRONG', stored), false);
  assert.ok(/\$\$|\$/.test(stored));
  // Salt makes identical passwords hash differently.
  const h2 = G.hashPassword_('JSK');
  assert.notEqual(stored, G.encodePasswordHash_(h2));
});

console.log('\nSUBSCRIPTION HUB — pure-logic test suite executed.');
