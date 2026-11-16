// Renewal queues — always reflects today's date. Views: upcoming, 7 days,
// 3 days, today, overdue, renewed.
import React from 'react';
import { useSearchParams } from 'react-router-dom';
import Icon from '../components/Icon';
import { Badge, Spinner, EmptyState } from '../components/ui';
import { WhatsAppButton } from '../components/WhatsAppButton';
import { useModals } from '../components/ModalsContext';
import { useRenewals, useSettings } from '../swr';
import { formatMoney, formatDate, daysLabel } from '../lib/format';

const VIEWS = [
  ['upcoming', 'All upcoming'], ['7days', 'Due in 7 days'], ['3days', 'Due in 3 days'],
  ['today', 'Due today'], ['overdue', 'Overdue / expired'], ['renewed', 'Renewed'],
];

export default function Renewals() {
  const [params, setParams] = useSearchParams();
  const view = params.get('view') || 'upcoming';
  const { data, isLoading } = useRenewals(view);
  const { data: settings } = useSettings();
  const modals = useModals();
  const symbol = (settings && settings.currency_symbol) || '₹';
  const items = (data && data.items) || [];

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="page-title">Renewals</h1>
          <p className="page-sub">As of {data ? formatDate(data.generated_on) : '—'} · {items.length} in this view</p>
        </div>
      </header>

      <div className="tabs tabs-scroll">
        {VIEWS.map(([v, l]) => (
          <button key={v} className={`tab ${view === v ? 'active' : ''}`} onClick={() => setParams(v === 'upcoming' ? {} : { view: v })}>
            {l}
          </button>
        ))}
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Customer</th><th>Phone</th><th>Plan</th><th>Expiry</th><th>Days</th><th className="num">Amount</th><th className="num">Outstanding</th><th>Reminder</th><th>Actions</th></tr></thead>
          <tbody>
            {isLoading && !data && <tr><td colSpan="9"><Spinner /></td></tr>}
            {!isLoading && items.length === 0 && <tr><td colSpan="9"><EmptyState icon="refresh" title="Nothing here" hint="No subscriptions in this view right now." /></td></tr>}
            {items.map((r) => (
              <tr key={r.subscription_id}>
                <td>
                  <a className="link-name" href={`#/customers/${r.customer_id}`}>
                    <span className="avatar avatar-xs">{r.customer_name.slice(0, 1)}</span> {r.customer_name}
                  </a>
                  <div className="mono muted">{r.customer_code}</div>
                </td>
                <td className="mono">{r.phone_e164}</td>
                <td>{r.plan_name}</td>
                <td>{formatDate(r.expiry_date)}</td>
                <td><span className={`days ${r.days_remaining < 0 ? 'text-danger' : r.days_remaining <= 3 ? 'text-warn' : ''}`}>{daysLabel(r.days_remaining)}</span></td>
                <td className="num">{formatMoney(r.subscription_amount, symbol)}</td>
                <td className="num">{r.outstanding > 0 ? <strong className="text-danger">{formatMoney(r.outstanding, symbol)}</strong> : formatMoney(0, symbol)}</td>
                <td><Badge status={r.reminder_status} /></td>
                <td>
                  <div className="row-actions">
                    <WhatsAppButton reminderId={r.reminder_id || undefined} customerId={r.customer_id} label="" variant="wa-icon" />
                    {!r.renewed && <button className="icon-btn" title="Renew" onClick={() => modals.openRenew(r.customer_id, r.subscription_id)}><Icon name="refresh" size={16} /></button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
