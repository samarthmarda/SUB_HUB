// Global modals: New Customer (4 sections), Renew Subscription, Record Payment,
// Edit Customer. Each is self-sufficient (fetches what it needs) and invalidates
// affected SWR caches on success.
import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal, Button, Field, TextInput, NumberInput, DateInput, Select, Textarea,
  useToast, useDebounced, Badge,
} from './ui';
import Icon from './Icon';
import { api, ApiError } from '../api';
import { usePlans, useSettings, useResource, useCustomerProfile, invalidate } from '../swr';
import { todayISO, formatDate, formatMoney } from '../lib/format';
import { computeExpiry, addDays } from '../lib/dates';

const METHODS = ['Cash', 'UPI', 'Bank Transfer', 'Card', 'Cheque', 'Other'];
const UNITS = [['DAY', 'Day(s)'], ['WEEK', 'Week(s)'], ['MONTH', 'Month(s)'], ['YEAR', 'Year(s)']];

function invalidateBusiness() {
  return invalidate('dashboard', 'customers', 'customer', 'subscriptions', 'payments', 'renewals', 'calendar', 'reminders', 'reports', 'capacity');
}

// ===========================================================================
// New Customer
// ===========================================================================
export function NewCustomerModal({ open, onClose, onCreated }) {
  const toast = useToast();
  const { data: plans } = usePlans();
  const { data: settings } = useSettings();
  const { data: capacity } = useResource(['capacity'], 'capacity', undefined);
  const symbol = (settings && settings.currency_symbol) || '₹';

  const activePlans = useMemo(() => (plans || []).filter((p) => p.is_active), [plans]);

  const [form, setForm] = useState(() => blankCustomer());
  const [dup, setDup] = useState({ checked: false, exists: false });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  const debouncedPhone = useDebounced(form.phone, 400);

  useEffect(() => { if (open) { setForm(blankCustomer()); setErrors({}); setDup({ checked: false, exists: false }); } }, [open]);

  // Duplicate phone check
  useEffect(() => {
    let active = true;
    const digits = (debouncedPhone || '').replace(/\D+/g, '');
    if (digits.length < 10) { setDup({ checked: false, exists: false }); return undefined; }
    api.checkDuplicatePhone(debouncedPhone).then((r) => { if (active) setDup({ checked: true, exists: !!r.exists, customer: r }); }).catch(() => {});
    return () => { active = false; };
  }, [debouncedPhone]);

  function set(patch) { setForm((f) => ({ ...f, ...patch })); }

  function onPlanChange(planId) {
    const plan = activePlans.find((p) => String(p.plan_id) === String(planId));
    if (!plan) { set({ plan_id: planId }); return; }
    const patch = {
      plan_id: plan.plan_id,
      duration_value: plan.duration_value,
      duration_unit: plan.duration_unit,
      amount_due: form.amount_due === '' || form.amount_due === 0 ? plan.default_price : form.amount_due,
      expiry_is_manual: false,
    };
    const nextExpiry = computeExpiry(form.start_date, plan.duration_value, plan.duration_unit);
    patch.expiry_date = nextExpiry || form.expiry_date;
    set(patch);
  }

  // Auto-compute expiry when start/duration change (unless manually overridden).
  useEffect(() => {
    if (form.expiry_is_manual) return;
    if (!form.start_date || !form.duration_value || !form.duration_unit) return;
    const e = computeExpiry(form.start_date, form.duration_value, form.duration_unit);
    if (e && e !== form.expiry_date) setForm((f) => ({ ...f, expiry_date: e }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.start_date, form.duration_value, form.duration_unit, form.expiry_is_manual]);

  const amountDue = Number(form.amount_due || 0);
  const amountReceived = Number(form.amount_received || 0);
  const outstanding = Math.max(0, amountDue - amountReceived);

  const activationNote = useMemo(() => {
    if (amountDue <= 0) return { tone: 'success', text: 'Zero-due subscription will be activated automatically.' };
    if (amountReceived >= amountDue) return { tone: 'success', text: 'Fully paid — will be activated automatically.' };
    if (form.approve_with_outstanding) return { tone: 'warning', text: `Will be activated with an outstanding balance of ${formatMoney(outstanding, symbol)}.` };
    return { tone: 'warning', text: `Will remain Pending Approval (outstanding ${formatMoney(outstanding, symbol)}).` };
  }, [amountDue, amountReceived, form.approve_with_outstanding, outstanding, symbol]);

  async function submit(andAnother) {
    setErrors({});
    const payload = {
      full_name: form.full_name,
      phone: form.phone,
      joined_date: form.joined_date,
      notes: form.notes,
      plan_id: form.plan_id,
      plan_name: (activePlans.find((p) => String(p.plan_id) === String(form.plan_id)) || {}).plan_name || 'Custom',
      duration_value: form.duration_value,
      duration_unit: form.duration_unit,
      start_date: form.start_date,
      expiry_date: form.expiry_date,
      expiry_is_manual: form.expiry_is_manual,
      amount_due: form.amount_due,
      amount_received: form.amount_received,
      payment_date: form.payment_date,
      payment_method: form.payment_method,
      transaction_reference: form.transaction_reference,
      approve_with_outstanding: form.approve_with_outstanding,
    };
    setSaving(true);
    try {
      const res = await api.createCustomer(payload);
      await invalidateBusiness();
      toast.success(`${res.customer.full_name} added (${res.customer.customer_code}).`);
      if (onCreated) onCreated(res.customer);
      if (andAnother) { setForm(blankCustomer()); setDup({ checked: false, exists: false }); }
      else onClose();
    } catch (e) {
      if (e instanceof ApiError && e.details && typeof e.details === 'object') setErrors(e.details);
      toast.error(e.message || 'Could not save the customer.');
    } finally {
      setSaving(false);
    }
  }

  const atLimit = capacity && capacity.atLimit;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New Customer"
      subtitle={capacity ? `${capacity.active} / ${capacity.capacity} members` : ''}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="secondary" loading={saving} onClick={() => submit(true)} disabled={atLimit}>Save &amp; Add Another</Button>
          <Button loading={saving} onClick={() => submit(false)} disabled={atLimit}>Save Customer</Button>
        </>
      }
    >
      {atLimit && (
        <div className="notice notice-warn">
          <Icon name="alert" /> Customer limit reached ({capacity.active}/{capacity.capacity}). Archive inactive customers to free a slot.
        </div>
      )}

      <div className="form-section">
        <h4 className="form-section-title"><span className="step">1</span> Personal information</h4>
        <div className="form-grid">
          <Field label="Full name" required error={errors.full_name}>
            <TextInput value={form.full_name} onChange={(e) => set({ full_name: e.target.value })} placeholder="e.g. Ramesh Kumar" autoFocus />
          </Field>
          <Field label="WhatsApp number" required error={errors.phone} hint="Indian 10-digit mobile — saved as +91…">
            <TextInput value={form.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="9876543210" inputMode="tel" />
          </Field>
          <Field label="Joined date">
            <DateInput value={form.joined_date} onChange={(e) => set({ joined_date: e.target.value })} />
          </Field>
          <Field label="Notes">
            <TextInput value={form.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Optional" />
          </Field>
        </div>
        {dup.exists && (
          <div className="notice notice-info">
            <Icon name="user" /> A customer named <strong>{dup.customer && dup.customer.full_name}</strong> already uses this number.
            <button className="link-btn" onClick={onClose}>Open existing profile instead</button>
          </div>
        )}
      </div>

      <div className="form-section">
        <h4 className="form-section-title"><span className="step">2</span> Subscription information</h4>
        <div className="form-grid">
          <Field label="Subscription plan" required error={errors.plan_id}>
            <Select value={form.plan_id} onChange={(e) => onPlanChange(e.target.value)}>
              <option value="">Select a plan…</option>
              {activePlans.map((p) => <option key={p.plan_id} value={p.plan_id}>{p.plan_name}</option>)}
              <option value="__custom">Custom</option>
            </Select>
          </Field>
          <Field label="Duration value" error={errors.duration_value}>
            <NumberInput value={form.duration_value} min="1" onChange={(e) => set({ duration_value: e.target.value, expiry_is_manual: false })} />
          </Field>
          <Field label="Duration unit">
            <Select value={form.duration_unit} onChange={(e) => set({ duration_unit: e.target.value, expiry_is_manual: false })}>
              {UNITS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </Select>
          </Field>
          <Field label="Start date" error={errors.start_date}>
            <DateInput value={form.start_date} onChange={(e) => set({ start_date: e.target.value })} />
          </Field>
          <Field label="Expiry date" error={errors.expiry_date} hint={form.expiry_is_manual ? 'Manually overridden' : 'Auto-calculated (inclusive)'}>
            <DateInput value={form.expiry_date} onChange={(e) => set({ expiry_date: e.target.value, expiry_is_manual: true })} />
          </Field>
          <Field label="Subscription amount" required error={errors.amount_due}>
            <NumberInput value={form.amount_due} min="0" onChange={(e) => set({ amount_due: e.target.value })} placeholder="0" />
          </Field>
        </div>
      </div>

      <div className="form-section">
        <h4 className="form-section-title"><span className="step">3</span> Payment information</h4>
        <div className="form-grid">
          <Field label="Amount received">
            <NumberInput value={form.amount_received} min="0" onChange={(e) => set({ amount_received: e.target.value })} placeholder="0" />
          </Field>
          <Field label="Payment date">
            <DateInput value={form.payment_date} onChange={(e) => set({ payment_date: e.target.value })} />
          </Field>
          <Field label="Payment method">
            <Select value={form.payment_method} onChange={(e) => set({ payment_method: e.target.value })}>
              <option value="">—</option>
              {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
            </Select>
          </Field>
          <Field label="Transaction reference">
            <TextInput value={form.transaction_reference} onChange={(e) => set({ transaction_reference: e.target.value })} placeholder="Optional" />
          </Field>
          <Field label="Outstanding balance">
            <div className="static-value">{formatMoney(outstanding, symbol)}</div>
          </Field>
        </div>
      </div>

      <div className="form-section">
        <h4 className="form-section-title"><span className="step">4</span> Activation</h4>
        <div className={`activation-note tone-${activationNote.tone}`}>
          <Icon name={activationNote.tone === 'success' ? 'check' : 'clock'} /> {activationNote.text}
        </div>
        {amountReceived < amountDue && (
          <label className="checkbox-row">
            <input type="checkbox" checked={form.approve_with_outstanding} onChange={(e) => set({ approve_with_outstanding: e.target.checked })} />
            <span>Approve &amp; activate with outstanding balance</span>
          </label>
        )}
      </div>
    </Modal>
  );
}

function blankCustomer() {
  const t = todayISO();
  return {
    full_name: '', phone: '', joined_date: t, notes: '',
    plan_id: '', duration_value: 1, duration_unit: 'MONTH',
    start_date: t, expiry_date: '', expiry_is_manual: false, amount_due: '',
    amount_received: '', payment_date: t, payment_method: 'UPI', transaction_reference: '',
    approve_with_outstanding: false,
  };
}

// ===========================================================================
// Renew Subscription
// ===========================================================================
export function RenewModal({ open, onClose, customerId, subscriptionId, onRenewed }) {
  const toast = useToast();
  const { data: plans } = usePlans();
  const { data: settings } = useSettings();
  const { data: profile } = useCustomerProfile(open ? customerId : null);
  const symbol = (settings && settings.currency_symbol) || '₹';
  const activePlans = useMemo(() => (plans || []).filter((p) => p.is_active), [plans]);

  const prev = useMemo(() => {
    const subs = (profile && profile.subscriptions) || [];
    return subs.find((s) => String(s.subscription_id) === String(subscriptionId)) || null;
  }, [profile, subscriptionId]);

  const [form, setForm] = useState(null);
  const [allowOverlap, setAllowOverlap] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !prev) { setForm(null); setAllowOverlap(false); return; }
    const today = todayISO();
    const early = prev.expiry_date >= today;
    const start = early ? addDays(prev.expiry_date, 1) : today;
    setForm({
      plan_id: prev.plan_id || '',
      plan_name: prev.plan_name || '',
      duration_value: prev.duration_value || 1,
      duration_unit: prev.duration_unit || 'MONTH',
      start_date: start,
      expiry_date: computeExpiry(start, prev.duration_value || 1, prev.duration_unit || 'MONTH') || '',
      expiry_is_manual: false,
      amount_due: prev.amount_due || 0,
      amount_received: '',
      payment_date: today,
      payment_method: 'UPI',
      approve_with_outstanding: false,
    });
  }, [open, prev]);

  function set(patch) { setForm((f) => ({ ...f, ...patch })); }
  function onPlanChange(planId) {
    const plan = activePlans.find((p) => String(p.plan_id) === String(planId));
    if (!plan) return;
    const patch = { plan_id: plan.plan_id, plan_name: plan.plan_name, duration_value: plan.duration_value, duration_unit: plan.duration_unit, expiry_is_manual: false };
    patch.expiry_date = computeExpiry(form.start_date, plan.duration_value, plan.duration_unit) || form.expiry_date;
    set(patch);
  }
  useEffect(() => {
    if (!form || form.expiry_is_manual) return;
    const e = computeExpiry(form.start_date, form.duration_value, form.duration_unit);
    if (e && e !== form.expiry_date) setForm((f) => ({ ...f, expiry_date: e }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form && form.start_date, form && form.duration_value, form && form.duration_unit, form && form.expiry_is_manual]);

  if (!open) return null;
  const amountDue = Number((form && form.amount_due) || 0);
  const amountReceived = Number((form && form.amount_received) || 0);
  const outstanding = Math.max(0, amountDue - amountReceived);
  const otherFuture = (profile && profile.subscriptions || []).filter((s) => String(s.subscription_id) !== String(subscriptionId) && s.activation_status !== 'Cancelled' && s.start_date > todayISO());

  async function submit() {
    setSaving(true);
    try {
      const payload = {
        previous_subscription_id: subscriptionId,
        plan_id: form.plan_id,
        plan_name: form.plan_name,
        duration_value: form.duration_value,
        duration_unit: form.duration_unit,
        start_date: form.start_date,
        expiry_date: form.expiry_date,
        expiry_is_manual: form.expiry_is_manual,
        amount_due: form.amount_due,
        amount_received: form.amount_received,
        payment_date: form.payment_date,
        payment_method: form.payment_method,
        approve_with_outstanding: form.approve_with_outstanding,
        allow_overlap: allowOverlap,
      };
      const res = await api.renewSubscription(payload);
      await invalidateBusiness();
      toast.success('Subscription renewed.');
      if (onRenewed) onRenewed(res);
      onClose();
    } catch (e) {
      if (e instanceof ApiError && e.code === 'OVERLAP') { setAllowOverlap(true); toast.error('Overlapping subscription detected — confirm the exception to continue.'); }
      else toast.error(e.message || 'Could not renew.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Renew Subscription"
      subtitle={profile && profile.customer ? `${profile.customer.full_name} · ${profile.customer.customer_code}` : ''}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button loading={saving} onClick={submit} disabled={!form}>Renew Subscription</Button>
        </>
      }
    >
      {!form ? <div className="spinner-wrap"><span className="spinner" /></div> : (
        <>
          {prev && (
            <div className="renew-context">
              <div><span className="ctx-label">Current plan</span><span className="ctx-value">{prev.plan_name}</span></div>
              <div><span className="ctx-label">Expires</span><span className="ctx-value">{formatDate(prev.expiry_date)}</span></div>
              <div><span className="ctx-label">Outstanding</span><span className="ctx-value">{formatMoney(prev.outstanding, symbol)}</span></div>
            </div>
          )}
          {otherFuture.length > 0 && (
            <div className="notice notice-warn"><Icon name="alert" /> This customer already has a future subscription. Review before renewing.</div>
          )}
          <div className="form-grid">
            <Field label="New plan">
              <Select value={form.plan_id} onChange={(e) => onPlanChange(e.target.value)}>
                <option value="">Select…</option>
                {activePlans.map((p) => <option key={p.plan_id} value={p.plan_id}>{p.plan_name}</option>)}
              </Select>
            </Field>
            <Field label="Duration value">
              <NumberInput value={form.duration_value} min="1" onChange={(e) => set({ duration_value: e.target.value, expiry_is_manual: false })} />
            </Field>
            <Field label="Duration unit">
              <Select value={form.duration_unit} onChange={(e) => set({ duration_unit: e.target.value, expiry_is_manual: false })}>
                {UNITS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </Select>
            </Field>
            <Field label="New start date" hint={prev && prev.expiry_date >= todayISO() ? 'Day after current expiry' : 'Defaults to today'}>
              <DateInput value={form.start_date} onChange={(e) => set({ start_date: e.target.value })} />
            </Field>
            <Field label="New expiry date">
              <DateInput value={form.expiry_date} onChange={(e) => set({ expiry_date: e.target.value, expiry_is_manual: true })} />
            </Field>
            <Field label="Subscription amount">
              <NumberInput value={form.amount_due} min="0" onChange={(e) => set({ amount_due: e.target.value })} />
            </Field>
            <Field label="Amount received">
              <NumberInput value={form.amount_received} min="0" onChange={(e) => set({ amount_received: e.target.value })} placeholder="0" />
            </Field>
            <Field label="Payment date">
              <DateInput value={form.payment_date} onChange={(e) => set({ payment_date: e.target.value })} />
            </Field>
            <Field label="Payment method">
              <Select value={form.payment_method} onChange={(e) => set({ payment_method: e.target.value })}>
                {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
              </Select>
            </Field>
            <Field label="Outstanding">
              <div className="static-value">{formatMoney(outstanding, symbol)}</div>
            </Field>
          </div>
          {amountReceived < amountDue && (
            <label className="checkbox-row">
              <input type="checkbox" checked={form.approve_with_outstanding} onChange={(e) => set({ approve_with_outstanding: e.target.checked })} />
              <span>Approve &amp; activate with outstanding balance</span>
            </label>
          )}
          {allowOverlap && (
            <label className="checkbox-row">
              <input type="checkbox" checked disabled />
              <span>Exception approved — allowing an overlapping subscription period.</span>
            </label>
          )}
        </>
      )}
    </Modal>
  );
}

// ===========================================================================
// Record Payment / Refund
// ===========================================================================
export function RecordPaymentModal({ open, onClose, customerId, subscriptionId, onRecorded }) {
  const toast = useToast();
  const { data: settings } = useSettings();
  const { data: profile } = useCustomerProfile(open ? customerId : null);
  const symbol = (settings && settings.currency_symbol) || '₹';
  const sub = useMemo(() => ((profile && profile.subscriptions) || []).find((s) => String(s.subscription_id) === String(subscriptionId)) || null, [profile, subscriptionId]);

  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) { setForm(null); return; }
    setForm({ entry_type: 'PAYMENT', amount: '', payment_date: todayISO(), payment_method: 'UPI', transaction_reference: '', notes: '' });
  }, [open]);

  if (!open) return null;
  const amount = Number((form && form.amount) || 0);
  const netPaid = sub ? sub.net_paid : 0;
  const due = sub ? sub.amount_due : 0;
  const isRefund = form && form.entry_type === 'REFUND';
  const refundInvalid = isRefund && amount > netPaid;

  async function submit() {
    setSaving(true);
    try {
      await api.recordPayment({
        customer_id: customerId,
        subscription_id: subscriptionId,
        entry_type: form.entry_type,
        amount: form.amount,
        payment_date: form.payment_date,
        payment_method: form.payment_method,
        transaction_reference: form.transaction_reference,
        notes: form.notes,
      });
      await invalidateBusiness();
      toast.success(isRefund ? 'Refund recorded.' : 'Payment recorded.');
      if (onRecorded) onRecorded();
      onClose();
    } catch (e) {
      toast.error(e.message || 'Could not record the transaction.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isRefund ? 'Record Refund' : 'Record Payment'}
      subtitle={profile && profile.customer ? `${profile.customer.full_name} · ${sub ? sub.plan_name : ''}` : ''}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button loading={saving} onClick={submit} disabled={!form || amount <= 0 || refundInvalid}>Record</Button>
        </>
      }
    >
      {!form ? <div className="spinner-wrap"><span className="spinner" /></div> : (
        <>
          {sub && (
            <div className="renew-context">
              <div><span className="ctx-label">Amount due</span><span className="ctx-value">{formatMoney(due, symbol)}</span></div>
              <div><span className="ctx-label">Net paid</span><span className="ctx-value">{formatMoney(netPaid, symbol)}</span></div>
              <div><span className="ctx-label">Outstanding</span><span className="ctx-value">{formatMoney(sub.outstanding, symbol)}</span></div>
            </div>
          )}
          <div className="form-grid">
            <Field label="Type">
              <Select value={form.entry_type} onChange={(e) => set({ entry_type: e.target.value })}>
                <option value="PAYMENT">Payment</option>
                <option value="REFUND">Refund / reversal</option>
              </Select>
            </Field>
            <Field label="Amount" required error={refundInvalid ? `Cannot exceed net paid (${formatMoney(netPaid, symbol)})` : undefined}>
              <NumberInput value={form.amount} min="0" onChange={(e) => set({ amount: e.target.value })} placeholder="0" />
            </Field>
            <Field label="Date">
              <DateInput value={form.payment_date} onChange={(e) => set({ payment_date: e.target.value })} />
            </Field>
            <Field label="Method">
              <Select value={form.payment_method} onChange={(e) => set({ payment_method: e.target.value })}>
                {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
              </Select>
            </Field>
            <Field label="Reference">
              <TextInput value={form.transaction_reference} onChange={(e) => set({ transaction_reference: e.target.value })} placeholder="Optional" />
            </Field>
            <Field label="Notes" className="span-2">
              <TextInput value={form.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Optional" />
            </Field>
          </div>
          <p className="modal-note">Payments are append-only. To correct a mistake, record a refund and a replacement payment.</p>
        </>
      )}
    </Modal>
  );
}

// ===========================================================================
// Edit Customer
// ===========================================================================
export function EditCustomerModal({ open, onClose, customerId, onSaved }) {
  const toast = useToast();
  const { data: profile } = useCustomerProfile(open ? customerId : null);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && profile && profile.customer) {
      setForm({
        full_name: profile.customer.full_name || '',
        phone_e164: profile.customer.phone_e164 || '',
        joined_date: profile.customer.joined_date || todayISO(),
        notes: profile.customer.notes || '',
      });
    }
    if (!open) setForm(null);
  }, [open, profile]);

  if (!open) return null;

  async function submit() {
    setSaving(true);
    try {
      await api.updateCustomer(customerId, form);
      await invalidate('customers', 'customer', 'dashboard');
      toast.success('Customer updated.');
      if (onSaved) onSaved();
      onClose();
    } catch (e) {
      toast.error(e.message || 'Could not update.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit Customer"
      size="md"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={saving} onClick={submit} disabled={!form}>Save changes</Button></>}
    >
      {!form ? <div className="spinner-wrap"><span className="spinner" /></div> : (
        <div className="form-grid">
          <Field label="Full name"><TextInput value={form.full_name} onChange={(e) => set({ full_name: e.target.value })} /></Field>
          <Field label="WhatsApp number"><TextInput value={form.phone_e164} onChange={(e) => set({ phone_e164: e.target.value })} /></Field>
          <Field label="Joined date"><DateInput value={form.joined_date} onChange={(e) => set({ joined_date: e.target.value })} /></Field>
          <Field label="Notes" className="span-2"><Textarea value={form.notes} onChange={(e) => set({ notes: e.target.value })} /></Field>
        </div>
      )}
    </Modal>
  );
}
