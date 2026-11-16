// Subscriptions list with activation/date-status filters and row actions.
import React, { useMemo, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import Icon from '../components/Icon';
import { Button, Badge, Select, Spinner, EmptyState, ConfirmDialog, useToast } from '../components/ui';
import { useModals } from '../components/ModalsContext';
import { useSubscriptions, useSettings, useCustomers, invalidate } from '../swr';
import { api } from '../api';
import { formatMoney, formatDate, daysLabel } from '../lib/format';

const ACTIVATION = ['', 'Pending Approval', 'Approved', 'Cancelled'];
const DATESTATUS = ['', 'Active', 'Upcoming', 'Expired'];

export default function Subscriptions() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const modals = useModals();
  const { data: settings } = useSettings();
  const symbol = (settings && settings.currency_symbol) || '₹';
  const urlStatus = params.get('status') || '';

  const [activation, setActivation] = useState(ACTIVATION.includes(urlStatus) ? urlStatus : '');
  const [dateStatus, setDateStatus] = useState(DATESTATUS.includes(urlStatus) ? urlStatus : '');
  const [cancelTarget, setCancelTarget] = useState(null);
  const [busy, setBusy] = useState(false);

  const filters = useMemo(() => ({ limit: 2000, activation_status: activation || undefined, status: dateStatus || undefined }), [activation, dateStatus]);
  const { data, isLoading } = useSubscriptions(filters);
  const { data: custData } = useCustomers({ page_size: 2000 });
  const nameById = useMemo(() => { const m = {}; ((custData && custData.items) || []).forEach((c) => { m[c.customer_id] = c; }); return m; }, [custData]);

  const items = data || [];

  async function approve(id) {
    setBusy(true);
    try { await api.approveSubscription(id); await invalidate('subscriptions', 'dashboard', 'customer', 'renewals', 'reports'); toast.success('Approved & activated.'); }
    catch (e) { toast.error(e.message || 'Failed.'); } finally { setBusy(false); }
  }
  async function doCancel() {
    if (!cancelTarget) return;
    setBusy(true);
    try { await api.cancelSubscription(cancelTarget.subscription_id, 'Cancelled by admin'); await invalidate('subscriptions', 'dashboard', 'customer', 'renewals', 'reports'); toast.success('Cancelled.'); setCancelTarget(null); }
    catch (e) { toast.error(e.message || 'Failed.'); } finally { setBusy(false); }
  }

  return (
    <div className="page">
      <header className="page-head">
        <div><h1 className="page-title">Subscriptions</h1><p className="page-sub">{items.length} subscription records</p></div>
      </header>

      <div className="toolbar">
        <Select value={activation} onChange={(e) => setActivation(e.target.value)} aria-label="Activation">
          {ACTIVATION.map((s) => <option key={s} value={s}>{s || 'All activation'}</option>)}
        </Select>
        <Select value={dateStatus} onChange={(e) => setDateStatus(e.target.value)} aria-label="Date status">
          {DATESTATUS.map((s) => <option key={s} value={s}>{s || 'All date status'}</option>)}
        </Select>
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Customer</th><th>Plan</th><th>Start</th><th>Expiry</th><th className="num">Amount</th><th className="num">Paid</th><th className="num">Outstanding</th><th>Payment</th><th>Activation</th><th>Date</th><th>Actions</th></tr></thead>
          <tbody>
            {isLoading && !data && <tr><td colSpan="11"><Spinner /></td></tr>}
            {!isLoading && items.length === 0 && <tr><td colSpan="11"><EmptyState icon="list" title="No subscriptions" /></td></tr>}
            {items.map((s) => {
              const cust = nameById[s.customer_id];
              return (
                <tr key={s.subscription_id}>
                  <td>{cust ? <button className="link-name" onClick={() => navigate(`/customers/${s.customer_id}`)}>{cust.full_name}</button> : <span className="mono">{String(s.customer_id).slice(0, 8)}…</span>}</td>
                  <td>{s.plan_name}</td>
                  <td>{formatDate(s.start_date)}</td>
                  <td>{formatDate(s.expiry_date)}</td>
                  <td className="num">{formatMoney(s.amount_due, symbol)}</td>
                  <td className="num">{formatMoney(s.amount_paid, symbol)}</td>
                  <td className="num">{s.outstanding > 0 ? <strong className="text-danger">{formatMoney(s.outstanding, symbol)}</strong> : formatMoney(0, symbol)}</td>
                  <td><Badge status={s.payment_status} /></td>
                  <td><Badge status={s.activation_status} /></td>
                  <td><Badge status={s.date_status} /></td>
                  <td>
                    <div className="row-actions">
                      {s.activation_status === 'Pending Approval' && <button className="icon-btn" title="Approve" disabled={busy} onClick={() => approve(s.subscription_id)}><Icon name="check" size={16} /></button>}
                      <button className="icon-btn" title="Renew" onClick={() => modals.openRenew(s.customer_id, s.subscription_id)}><Icon name="refresh" size={16} /></button>
                      <button className="icon-btn" title="Record payment" onClick={() => modals.openPayment(s.customer_id, s.subscription_id)}><Icon name="rupee" size={16} /></button>
                      {s.activation_status !== 'Cancelled' && <button className="icon-btn danger" title="Cancel" onClick={() => setCancelTarget(s)}><Icon name="x" size={16} /></button>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ConfirmDialog open={!!cancelTarget} onClose={() => setCancelTarget(null)} onConfirm={doCancel} loading={busy} danger title="Cancel subscription?" confirmLabel="Cancel" message="The record is kept for history but removed from active renewals." />
    </div>
  );
}
