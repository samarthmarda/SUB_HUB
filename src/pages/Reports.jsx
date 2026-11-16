// Reports & analytics with CSV export. All figures derive from real records.
import React, { useState } from 'react';
import Icon from '../components/Icon';
import { Button, Spinner } from '../components/ui';
import { BarChart } from '../components/charts';
import { useReports } from '../swr';
import { api } from '../api';
import { useToast } from '../components/ui';
import { formatMoney } from '../lib/format';

const RANGES = [['today', 'Today'], ['7d', '7 days'], ['30d', '30 days'], ['mtd', 'MTD'], ['all', 'All time']];

function downloadCsv(filename, csv) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function Reports() {
  const [range, setRange] = useState('30d');
  const { data, isLoading, error } = useReports(range);
  const toast = useToast();

  async function exportType(type) {
    try {
      const res = await api.exportCsv(type);
      downloadCsv(res.filename, res.csv);
      toast.success('Export downloaded.');
    } catch (e) { toast.error(e.message || 'Export failed.'); }
  }

  if (isLoading && !data) return <div className="page"><Spinner label="Crunching reports…" /></div>;
  if (error) return <div className="page"><div className="notice notice-danger"><Icon name="alert" /> {error.message}</div></div>;
  if (!data) return null;
  const sym = data.currency_symbol || '₹';

  const methodEntries = Object.entries(data.revenue.by_method || {});

  return (
    <div className="page">
      <header className="page-head">
        <div><h1 className="page-title">Reports</h1><p className="page-sub">Revenue, subscriptions &amp; outstanding — from real records</p></div>
        <div className="range-filter">
          {RANGES.map(([v, l]) => <button key={v} className={`range-btn ${range === v ? 'active' : ''}`} onClick={() => setRange(v)}>{l}</button>)}
        </div>
      </header>

      <section className="report-grid">
        <div className="panel">
          <header className="panel-head"><h3 className="panel-title">Revenue</h3></header>
          <div className="panel-body">
            <div className="detail-list">
              <div><span>Today</span><strong>{formatMoney(data.revenue.today, sym)}</strong></div>
              <div><span>This month</span><strong>{formatMoney(data.revenue.this_month, sym)}</strong></div>
              <div><span>Last month</span><strong>{formatMoney(data.revenue.last_month, sym)}</strong></div>
              <div><span>Lifetime collections</span><strong>{formatMoney(data.revenue.lifetime_collections, sym)}</strong></div>
            </div>
            <h4 className="mini-title">By payment method</h4>
            <div className="method-list">
              {methodEntries.length === 0 && <p className="muted">No payments yet.</p>}
              {methodEntries.map(([m, v]) => (
                <div key={m} className="method-row"><span>{m}</span><strong>{formatMoney(v, sym)}</strong></div>
              ))}
            </div>
          </div>
        </div>

        <div className="panel">
          <header className="panel-head"><h3 className="panel-title">Subscriptions</h3></header>
          <div className="panel-body">
            <div className="detail-list">
              <div><span>Active</span><strong>{data.subscriptions.active}</strong></div>
              <div><span>New customers (today)</span><strong>{data.subscriptions.new_customers_today}</strong></div>
              <div><span>Renewals completed</span><strong>{data.subscriptions.renewals_completed}</strong></div>
              <div><span>Upcoming renewals</span><strong>{data.subscriptions.upcoming_renewals}</strong></div>
              <div><span>Expired</span><strong>{data.subscriptions.expired}</strong></div>
              <div><span>Repeat customers</span><strong>{data.subscriptions.repeat_customers}</strong></div>
            </div>
          </div>
        </div>

        <div className="panel">
          <header className="panel-head"><h3 className="panel-title">Outstanding</h3></header>
          <div className="panel-body">
            <div className="detail-list">
              <div><span>Partially paid</span><strong>{data.outstanding.partially_paid}</strong></div>
              <div><span>Unpaid</span><strong>{data.outstanding.unpaid}</strong></div>
              <div><span>Total outstanding</span><strong className="text-danger">{formatMoney(data.outstanding.outstanding_total, sym)}</strong></div>
              <div><span>Overdue balances</span><strong>{data.outstanding.overdue_count} · {formatMoney(data.outstanding.overdue_total, sym)}</strong></div>
            </div>
          </div>
        </div>
      </section>

      <section className="panel">
        <header className="panel-head"><div><h3 className="panel-title">Monthly revenue</h3><p className="panel-sub">Last 12 months · by payment date</p></div></header>
        <div className="panel-body">
          <BarChart data={(data.revenue.trend || []).map((m) => ({ label: m.label, short: m.label.split(' ')[0], value: m.revenue }))} valueFmt={(v) => sym + (v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v)} />
        </div>
      </section>

      <section className="panel">
        <header className="panel-head"><h3 className="panel-title">Export</h3></header>
        <div className="panel-body export-row">
          <Button variant="secondary" icon={<Icon name="download" size={15} />} onClick={() => exportType('customers')}>Customers CSV</Button>
          <Button variant="secondary" icon={<Icon name="download" size={15} />} onClick={() => exportType('payments')}>Payments CSV</Button>
          <Button variant="secondary" icon={<Icon name="download" size={15} />} onClick={() => exportType('renewals')}>Renewals CSV</Button>
          <Button variant="secondary" icon={<Icon name="download" size={15} />} onClick={() => exportType('outstanding')}>Outstanding CSV</Button>
        </div>
      </section>
    </div>
  );
}
