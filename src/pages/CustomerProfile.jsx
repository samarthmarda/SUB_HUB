// Customer 360 profile: overview, subscription history, payments, renewal
// history, reminder activity and activity log, with WhatsApp / Edit / Renew /
// Record Payment / Approve actions.
import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Icon from '../components/Icon';
import { Button, Badge, Spinner, EmptyState, ConfirmDialog, useToast } from '../components/ui';
import { WhatsAppButton } from '../components/WhatsAppButton';
import { useModals } from '../components/ModalsContext';
import { useCustomerProfile, useSettings, invalidate } from '../swr';
import { api } from '../api';
import { formatMoney, formatDate, daysLabel } from '../lib/format';

const TABS = [
  ['overview', 'Overview'], ['subscriptions', 'Subscription history'],
  ['payments', 'Payment history'], ['renewals', 'Renewal history'],
  ['reminders', 'Reminder activity'], ['activity', 'Activity log'],
];

export default function CustomerProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const modals = useModals();
  const { data, error, isLoading } = useCustomerProfile(id);
  const { data: settings } = useSettings();
  const symbol = (settings && settings.currency_symbol) || '₹';
  const [tab, setTab] = useState('overview');
  const [cancelTarget, setCancelTarget] = useState(null);
  const [busy, setBusy] = useState(false);

  if (isLoading && !data) return <div className="page"><Spinner label="Loading profile…" /></div>;
  if (error) return <div className="page"><div className="notice notice-danger"><Icon name="alert" /> {error.message}</div></div>;
  if (!data) return null;

  const c = data.customer;
  const cur = c.current_subscription;
  const next = c.next_subscription;
  const life = data.lifetime;

  async function approve(subId) {
    setBusy(true);
    try {
      await api.approveSubscription(subId);
      await invalidate('customer', 'dashboard', 'subscriptions', 'renewals', 'reports');
      toast.success('Subscription approved & activated.');
    } catch (e) { toast.error(e.message || 'Approve failed.'); }
    finally { setBusy(false); }
  }
  async function doCancel() {
    if (!cancelTarget) return;
    setBusy(true);
    try {
      await api.cancelSubscription(cancelTarget.subscription_id, cancelTarget.reason || '');
      await invalidate('customer', 'dashboard', 'subscriptions', 'renewals', 'reports');
      toast.success('Subscription cancelled.');
      setCancelTarget(null);
    } catch (e) { toast.error(e.message || 'Cancel failed.'); }
    finally { setBusy(false); }
  }

  return (
    <div className="page">
      <button className="back-link" onClick={() => navigate('/customers')}><Icon name="external" size={14} style={{ transform: 'rotate(180deg)' }} /> Back to customers</button>

      <header className="profile-head">
        <div className="profile-id">
          <span className="avatar avatar-lg">{c.full_name.slice(0, 1)}</span>
          <div>
            <h1 className="profile-name">{c.full_name}</h1>
            <p className="profile-meta">
              <span className="mono">{c.customer_code}</span> · <span className="mono">{c.phone_e164}</span> · Joined {formatDate(c.joined_date)}
              {c.is_archived && <Badge status="Archived" />}
            </p>
          </div>
        </div>
        <div className="profile-status">
          <Badge status={cur ? cur.activation_status : 'No Subscription'} />
          {cur && <Badge status={cur.date_status} />}
        </div>
        <div className="profile-actions">
          <WhatsAppButton customerId={c.customer_id} label="WhatsApp" />
          <Button variant="secondary" icon={<Icon name="edit" size={15} />} onClick={() => modals.openEditCustomer(c.customer_id)}>Edit</Button>
          {cur && <Button icon={<Icon name="refresh" size={15} />} onClick={() => modals.openRenew(c.customer_id, cur.subscription_id)}>Renew</Button>}
        </div>
      </header>

      <div className="tabs">
        {TABS.map(([k, l]) => <button key={k} className={`tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>{l}</button>)}
      </div>

      {tab === 'overview' && (
        <div className="profile-grid">
          <div className="panel">
            <header className="panel-head"><h3 className="panel-title">Current subscription</h3></header>
            <div className="panel-body">
              {cur ? (
                <div className="detail-list">
                  <div><span>Plan</span><strong>{cur.plan_name}</strong></div>
                  <div><span>Period</span><strong>{formatDate(cur.start_date)} → {formatDate(cur.expiry_date)}</strong></div>
                  <div><span>Days to expiry</span><strong>{daysLabel(data.customer.days_to_expiry)}</strong></div>
                  <div><span>Amount due</span><strong>{formatMoney(cur.amount_due, symbol)}</strong></div>
                  <div><span>Paid</span><strong>{formatMoney(cur.amount_paid, symbol)}</strong></div>
                  <div><span>Outstanding</span><strong className={cur.outstanding > 0 ? 'text-danger' : ''}>{formatMoney(cur.outstanding, symbol)}</strong></div>
                  <div><span>Payment status</span><Badge status={cur.payment_status} /></div>
                  <div><span>Activation</span><Badge status={cur.activation_status} /></div>
                </div>
              ) : <EmptyState title="No subscription yet" hint="Add or renew a subscription." />}
            </div>
          </div>
          <div className="panel">
            <header className="panel-head"><h3 className="panel-title">Account summary</h3></header>
            <div className="panel-body">
              <div className="detail-list">
                <div><span>Lifetime payments</span><strong>{formatMoney(life.total_payments, symbol)}</strong></div>
                <div><span>Refunds</span><strong>{formatMoney(life.total_refunds, symbol)}</strong></div>
                <div><span>Net collected</span><strong>{formatMoney(life.net_collected, symbol)}</strong></div>
                <div><span>Current outstanding</span><strong className={life.outstanding > 0 ? 'text-danger' : ''}>{formatMoney(life.outstanding, symbol)}</strong></div>
                <div><span>Next scheduled</span><strong>{next ? `${next.plan_name} · ${formatDate(next.start_date)}` : '—'}</strong></div>
                <div><span>Account status</span><Badge status={c.date_status} /></div>
              </div>
              <div className="profile-quick">
                {cur && cur.activation_status === 'Pending Approval' && (
                  <Button size="sm" loading={busy} onClick={() => approve(cur.subscription_id)}><Icon name="check" size={15} /> Approve &amp; activate</Button>
                )}
                {cur && <Button size="sm" variant="secondary" onClick={() => modals.openPayment(c.customer_id, cur.subscription_id)}><Icon name="rupee" size={15} /> Record payment</Button>}
                {cur && cur.outstanding > 0 && <Button size="sm" variant="secondary" onClick={() => modals.openPayment(c.customer_id, cur.subscription_id)}>Collect balance</Button>}
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'subscriptions' && (
        <div className="table-wrap panel">
          <table className="table">
            <thead><tr><th>Plan</th><th>Start</th><th>Expiry</th><th className="num">Amount</th><th>Payment status</th><th>Activation</th><th>Actions</th></tr></thead>
            <tbody>
              {data.subscriptions.length === 0 && <tr><td colSpan="7"><EmptyState title="No subscriptions" /></td></tr>}
              {data.subscriptions.map((s) => (
                <tr key={s.subscription_id}>
                  <td>{s.plan_name}</td>
                  <td>{formatDate(s.start_date)}</td>
                  <td>{formatDate(s.expiry_date)}{s.expiry_is_manual && <small className="muted"> (manual)</small>}</td>
                  <td className="num">{formatMoney(s.amount_due, symbol)}</td>
                  <td><Badge status={s.payment_status} />{s.outstanding > 0 && <div className="sub-badge text-danger">{formatMoney(s.outstanding, symbol)} due</div>}</td>
                  <td><Badge status={s.activation_status} /></td>
                  <td>
                    <div className="row-actions">
                      {s.activation_status === 'Pending Approval' && <button className="icon-btn" title="Approve" onClick={() => approve(s.subscription_id)}><Icon name="check" size={16} /></button>}
                      <button className="icon-btn" title="Renew" onClick={() => modals.openRenew(c.customer_id, s.subscription_id)}><Icon name="refresh" size={16} /></button>
                      <button className="icon-btn" title="Record payment" onClick={() => modals.openPayment(c.customer_id, s.subscription_id)}><Icon name="rupee" size={16} /></button>
                      {s.activation_status !== 'Cancelled' && <button className="icon-btn danger" title="Cancel" onClick={() => setCancelTarget(s)}><Icon name="x" size={16} /></button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'payments' && (
        <div className="table-wrap panel">
          <table className="table">
            <thead><tr><th>Date</th><th>Type</th><th className="num">Amount</th><th>Method</th><th>Reference</th><th>Notes</th></tr></thead>
            <tbody>
              {data.payments.length === 0 && <tr><td colSpan="6"><EmptyState title="No payments recorded" /></td></tr>}
              {data.payments.map((p) => (
                <tr key={p.payment_id}>
                  <td>{formatDate(p.payment_date)}</td>
                  <td><Badge status={p.entry_type === 'REFUND' ? 'Rejected' : 'Paid'}>{p.entry_type}</Badge></td>
                  <td className={`num ${p.entry_type === 'REFUND' ? 'text-danger' : ''}`}>{p.entry_type === 'REFUND' ? '−' : '+'}{formatMoney(p.amount, symbol)}</td>
                  <td>{p.payment_method || '—'}</td>
                  <td className="mono">{p.transaction_reference || '—'}</td>
                  <td>{p.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'renewals' && (
        <div className="table-wrap panel">
          <table className="table">
            <thead><tr><th>Renewed from</th><th>Plan</th><th>New period</th><th className="num">Amount</th><th>Status</th></tr></thead>
            <tbody>
              {data.subscriptions.filter((s) => s.previous_subscription_id).length === 0 && <tr><td colSpan="5"><EmptyState title="No renewals yet" hint="Renewals create a new subscription linked to the previous one." /></td></tr>}
              {data.subscriptions.filter((s) => s.previous_subscription_id).map((s) => (
                <tr key={s.subscription_id}>
                  <td className="mono">{String(s.previous_subscription_id).slice(0, 8)}…</td>
                  <td>{s.plan_name}</td>
                  <td>{formatDate(s.start_date)} → {formatDate(s.expiry_date)}</td>
                  <td className="num">{formatMoney(s.amount_due, symbol)}</td>
                  <td><Badge status={s.activation_status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'reminders' && (
        <div className="table-wrap panel">
          <table className="table">
            <thead><tr><th>Type</th><th>Scheduled</th><th>Status</th><th>Follow-up</th><th>Notes</th></tr></thead>
            <tbody>
              {data.reminders.length === 0 && <tr><td colSpan="5"><EmptyState title="No reminders yet" /></td></tr>}
              {data.reminders.map((r) => (
                <tr key={r.reminder_id}>
                  <td>{r.reminder_type}</td>
                  <td>{formatDate(r.scheduled_date)}</td>
                  <td><Badge status={r.status} /></td>
                  <td><Badge status={r.followup_status} /></td>
                  <td>{r.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'activity' && (
        <div className="panel">
          <div className="panel-body activity-list">
            {data.activity.length === 0 && <EmptyState title="No activity recorded" />}
            {data.activity.map((a) => (
              <div key={a.audit_id} className="activity-item">
                <span className="activity-icon"><Icon name="list" size={15} /></span>
                <div className="activity-text">
                  <span className="activity-title">{a.action} · {a.entity_type}</span>
                  <span className="activity-meta">{a.performed_by} · {formatDate(String(a.timestamp).slice(0, 10))}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        onConfirm={doCancel}
        loading={busy}
        danger
        title="Cancel subscription?"
        confirmLabel="Cancel subscription"
        message="Cancelling keeps the record for history but removes it from active renewals. Payments already recorded are retained."
      />
    </div>
  );
}
