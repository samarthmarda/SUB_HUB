// Payments & Dues: outstanding summary, dues list (record payment per row) and a
// full transactions ledger with filters.
import React, { useMemo, useState } from 'react';
import Icon from '../components/Icon';
import { Button, Badge, Select, TextInput, Spinner, EmptyState } from '../components/ui';
import { WhatsAppButton } from '../components/WhatsAppButton';
import { useModals } from '../components/ModalsContext';
import { useSubscriptions, usePayments, useCustomers, useSettings } from '../swr';
import { formatMoney, formatDate } from '../lib/format';

const METHODS = ['', 'Cash', 'UPI', 'Bank Transfer', 'Card', 'Cheque', 'Other'];

export default function Payments() {
  const modals = useModals();
  const { data: settings } = useSettings();
  const symbol = (settings && settings.currency_symbol) || '₹';
  const { data: subs } = useSubscriptions({ limit: 3000 });
  const { data: custData } = useCustomers({ page_size: 2000 });
  const nameById = useMemo(() => { const m = {}; ((custData && custData.items) || []).forEach((c) => { m[c.customer_id] = c; }); return m; }, [custData]);

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [method, setMethod] = useState('');
  const { data: payments, isLoading: payLoading } = usePayments({ from: from || undefined, to: to || undefined, payment_method: method || undefined, limit: 500 });

  const dues = useMemo(() => (subs || []).filter((s) => s.outstanding > 0 && s.activation_status !== 'Cancelled')
    .sort((a, b) => (a.expiry_date < b.expiry_date ? -1 : 1)), [subs]);

  const summary = useMemo(() => {
    const list = (subs || []).filter((s) => s.activation_status !== 'Cancelled');
    const today = new Date().toISOString().slice(0, 10);
    return {
      outstanding: list.reduce((s, x) => s + x.outstanding, 0),
      overdueCount: list.filter((x) => x.outstanding > 0 && x.expiry_date < today).length,
      partial: list.filter((x) => x.payment_status === 'Partially Paid').length,
      unpaid: list.filter((x) => x.payment_status === 'Unpaid').length,
    };
  }, [subs]);

  return (
    <div className="page">
      <header className="page-head">
        <div><h1 className="page-title">Payments &amp; Dues</h1><p className="page-sub">Collections and outstanding balances</p></div>
      </header>

      <section className="stat-row">
        <div className="stat-card"><span className="stat-label">Total outstanding</span><span className="stat-value text-danger">{formatMoney(summary.outstanding, symbol)}</span></div>
        <div className="stat-card"><span className="stat-label">Overdue balances</span><span className="stat-value">{summary.overdueCount}</span></div>
        <div className="stat-card"><span className="stat-label">Partially paid</span><span className="stat-value">{summary.partial}</span></div>
        <div className="stat-card"><span className="stat-label">Unpaid</span><span className="stat-value">{summary.unpaid}</span></div>
      </section>

      <h2 className="section-title">Outstanding dues</h2>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Customer</th><th>Plan</th><th>Expiry</th><th className="num">Due</th><th className="num">Paid</th><th className="num">Outstanding</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {dues.length === 0 && <tr><td colSpan="8"><EmptyState icon="check" title="All settled" hint="No outstanding balances." /></td></tr>}
            {dues.map((s) => {
              const c = nameById[s.customer_id] || {};
              return (
                <tr key={s.subscription_id}>
                  <td><a className="link-name" href={`#/customers/${s.customer_id}`}>{c.full_name || '—'}</a></td>
                  <td>{s.plan_name}</td>
                  <td>{formatDate(s.expiry_date)}</td>
                  <td className="num">{formatMoney(s.amount_due, symbol)}</td>
                  <td className="num">{formatMoney(s.amount_paid, symbol)}</td>
                  <td className="num"><strong className="text-danger">{formatMoney(s.outstanding, symbol)}</strong></td>
                  <td><Badge status={s.payment_status} /></td>
                  <td>
                    <div className="row-actions">
                      <Button size="xs" onClick={() => modals.openPayment(s.customer_id, s.subscription_id)}><Icon name="rupee" size={14} /> Record</Button>
                      <WhatsAppButton customerId={s.customer_id} label="" variant="wa-icon" />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h2 className="section-title">Transactions</h2>
      <div className="toolbar">
        <label className="inline-field"><span>From</span><input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="inline-field"><span>To</span><input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <Select value={method} onChange={(e) => setMethod(e.target.value)} aria-label="Method">
          {METHODS.map((m) => <option key={m} value={m}>{m || 'All methods'}</option>)}
        </Select>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Date</th><th>Customer</th><th>Type</th><th className="num">Amount</th><th>Method</th><th>Reference</th></tr></thead>
          <tbody>
            {payLoading && !payments && <tr><td colSpan="6"><Spinner /></td></tr>}
            {!payLoading && (payments || []).length === 0 && <tr><td colSpan="6"><EmptyState icon="wallet" title="No transactions" /></td></tr>}
            {(payments || []).map((p) => {
              const c = nameById[p.customer_id] || {};
              return (
                <tr key={p.payment_id}>
                  <td>{formatDate(p.payment_date)}</td>
                  <td>{c.full_name || <span className="mono">{String(p.customer_id).slice(0, 8)}…</span>}</td>
                  <td><Badge status={p.entry_type === 'REFUND' ? 'Rejected' : 'Paid'}>{p.entry_type}</Badge></td>
                  <td className={`num ${p.entry_type === 'REFUND' ? 'text-danger' : ''}`}>{p.entry_type === 'REFUND' ? '−' : '+'}{formatMoney(p.amount, symbol)}</td>
                  <td>{p.payment_method || '—'}</td>
                  <td className="mono">{p.transaction_reference || '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
