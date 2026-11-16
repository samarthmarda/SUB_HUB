// Dashboard: greeting header + date filters, six KPI cards, three analytics panels,
// quick actions, action queue and recent activity — all from real records.
import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../components/Icon';
import { AreaChart, BarChart, DonutChart } from '../components/charts';
import { Spinner } from '../components/ui';
import { useModals } from '../components/ModalsContext';
import { useDashboard } from '../swr';
import { formatMoney, formatDate, formatDateLong, todayISO } from '../lib/format';
import { addDays } from '../lib/dates';

const RANGES = [['today', 'Today'], ['7d', 'Last 7 days'], ['30d', 'Last 30 days'], ['mtd', 'Month to date']];

function greeting(name) {
  const h = new Date().getHours();
  const part = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  const who = (name || 'there').replace(/\b\w/g, (c) => c.toUpperCase());
  return `${part}, ${who}!`;
}

function timeAgo(iso) {
  if (!iso) return '';
  const s = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
}

function KpiCard({ icon, value, label, sub, tone, to }) {
  const navigate = useNavigate();
  return (
    <button className={`kpi-card kpi-${tone}`} onClick={() => to && navigate(to)}>
      <div className="kpi-top">
        <span className="kpi-icon"><Icon name={icon} size={20} /></span>
        {to && <span className="kpi-link">View <Icon name="external" size={12} /></span>}
      </div>
      <div className="kpi-value">{value}</div>
      <div className="kpi-label">{label}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </button>
  );
}

function ActionRow({ icon, count, label, to, tone }) {
  const navigate = useNavigate();
  return (
    <button className={`action-row action-${tone}`} onClick={() => navigate(to)}>
      <span className="action-icon"><Icon name={icon} size={16} /></span>
      <span className="action-label">{label}</span>
      <span className="action-count">{count}</span>
      <Icon name="external" size={14} />
    </button>
  );
}

export default function Dashboard() {
  const [range, setRange] = useState('30d');
  const { data, error, isLoading } = useDashboard(range);
  const modals = useModals();
  const navigate = useNavigate();
  const symbol = (data && data.currency_symbol) || '₹';

  const weeklyForecast = useMemo(() => {
    const daily = (data && data.analytics && data.analytics.renewal_forecast.daily) || [];
    const weeks = [];
    daily.forEach((d) => {
      const dt = new Date(d.date + 'T00:00:00');
      const dow = (dt.getDay() + 6) % 7;
      const monday = addDays(d.date, -dow);
      let w = weeks.find((x) => x.key === monday);
      if (!w) { w = { key: monday, label: 'Wk ' + formatDate(monday), count: 0 }; weeks.push(w); }
      w.count += d.count;
    });
    return weeks;
  }, [data]);

  if (isLoading && !data) {
    return <div className="page"><Spinner label="Loading your dashboard…" /></div>;
  }
  if (error) {
    return <div className="page"><div className="notice notice-danger"><Icon name="alert" /> {error.message}</div></div>;
  }
  if (!data) return null;

  const k = data.kpis;
  const aq = data.action_queue;
  const dist = data.analytics.payment_distribution;
  const distData = [
    { label: 'Paid', value: dist.Paid || 0 },
    { label: 'Partially Paid', value: dist['Partially Paid'] || 0 },
    { label: 'Unpaid', value: dist.Unpaid || 0 },
    { label: 'Credit Balance', value: dist['Credit Balance'] || 0 },
  ];

  return (
    <div className="page dashboard">
      <header className="page-head">
        <div>
          <h1 className="page-title">{greeting(data.greeting_name)}</h1>
          <p className="page-sub">
            {formatDateLong(todayISO())} · <strong>{data.business_name}</strong> · <span className="status-live"><span className="pulse" /> Subscription system online</span>
          </p>
        </div>
        <div className="range-filter" role="tablist">
          {RANGES.map(([v, l]) => (
            <button key={v} className={`range-btn ${range === v ? 'active' : ''}`} onClick={() => setRange(v)}>{l}</button>
          ))}
        </div>
      </header>

      <section className="kpi-grid">
        <KpiCard icon="users" tone="coral" value={k.active_members} label="Active members" sub={`${k.total_customers} total customers`} to="/customers" />
        <KpiCard icon="list" tone="blue" value={k.active_subscriptions} label="Active subscriptions" sub="Approved & within dates" to="/subscriptions?status=Active" />
        <KpiCard icon="rupee" tone="green" value={formatMoney(k.revenue_mtd, symbol)} label="Revenue (MTD)" sub="Payments this month" to="/reports" />
        <KpiCard icon="wallet" tone="amber" value={formatMoney(k.outstanding_balance, symbol)} label="Outstanding balance" sub={`${aq.pending_payment_balances} with balance`} to="/payments" />
        <KpiCard icon="clock" tone="amber" value={k.expiring_7_days} label="Expiring in 7 days" sub="Renew soon" to="/renewals?view=7days" />
        <KpiCard icon="alert" tone="red" value={k.expired_subscriptions} label="Expired subscriptions" sub="Needs attention" to="/renewals?view=overdue" />
      </section>

      <section className="analytics-grid">
        <div className="panel">
          <header className="panel-head">
            <div><h3 className="panel-title">Renewal forecast</h3><p className="panel-sub">Expected renewals · next 30 days (by expiry date)</p></div>
          </header>
          <div className="panel-body">
            <ForecastToggle daily={(data.analytics.renewal_forecast.daily || []).map((d) => ({ label: d.label, short: d.label.slice(0, 6), value: d.count }))} weekly={weeklyForecast.map((w) => ({ label: w.label, short: w.label, value: w.count }))} total={data.analytics.renewal_forecast.total} />
          </div>
        </div>

        <div className="panel">
          <header className="panel-head">
            <div><h3 className="panel-title">Revenue trend</h3><p className="panel-sub">Last 6 months · by payment date</p></div>
          </header>
          <div className="panel-body">
            <AreaChart data={(data.analytics.revenue_trend || []).map((m) => ({ label: m.label.split(' ')[0], value: m.revenue }))} valueFmt={(v) => symbol + (v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v)} />
          </div>
        </div>

        <div className="panel">
          <header className="panel-head">
            <div><h3 className="panel-title">Payment distribution</h3><p className="panel-sub">By subscription balance</p></div>
          </header>
          <div className="panel-body">
            <DonutChart data={distData} centerValue={String(dist.Paid || 0)} centerLabel="fully paid" />
          </div>
        </div>
      </section>

      <section className="lower-grid">
        <div className="panel">
          <header className="panel-head"><div><h3 className="panel-title">Quick actions</h3><p className="panel-sub">Common tasks</p></div></header>
          <div className="panel-body quick-actions">
            <button className="quick-action qa-primary" onClick={modals.openNewCustomer}><Icon name="plus" size={18} /> New Customer</button>
            <button className="quick-action" onClick={() => navigate('/payments')}><Icon name="rupee" size={18} /> Record Payment</button>
            <button className="quick-action" onClick={() => navigate('/renewals')}><Icon name="refresh" size={18} /> Renew Subscription</button>
            <button className="quick-action" onClick={() => navigate('/calendar')}><Icon name="calendar" size={18} /> Renewal Calendar</button>
            <button className="quick-action" onClick={() => navigate('/reminders')}><Icon name="chat" size={18} /> WhatsApp Reminder Queue</button>
          </div>
        </div>

        <div className="panel">
          <header className="panel-head"><div><h3 className="panel-title">Action queue</h3><p className="panel-sub">What needs your attention</p></div></header>
          <div className="panel-body action-queue">
            <ActionRow icon="clock" tone="orange" count={aq.renewals_today} label="Renewals due today" to="/renewals?view=today" />
            <ActionRow icon="clock" tone="amber" count={aq.renewals_3days} label="Due in next 3 days" to="/renewals?view=3days" />
            <ActionRow icon="clock" tone="amber" count={aq.renewals_7days} label="Due in next 7 days" to="/renewals?view=7days" />
            <ActionRow icon="alert" tone="red" count={aq.expired_customers} label="Expired customers" to="/renewals?view=overdue" />
            <ActionRow icon="check" tone="blue" count={aq.pending_approvals} label="Pending subscription approvals" to="/subscriptions?status=Pending Approval" />
            <ActionRow icon="wallet" tone="amber" count={aq.pending_payment_balances} label="Pending payment balances" to="/payments" />
            <ActionRow icon="chat" tone="blue" count={aq.followups_pending} label="Follow-ups not completed" to="/reminders?bucket=followuppending" />
          </div>
        </div>

        <div className="panel">
          <header className="panel-head"><div><h3 className="panel-title">Recent activity</h3><p className="panel-sub">Latest changes</p></div></header>
          <div className="panel-body activity-list">
            {(data.recent_activity || []).length === 0 && <p className="muted">No recent activity yet.</p>}
            {(data.recent_activity || []).map((a) => (
              <div key={a.audit_id} className="activity-item">
                <span className={`activity-icon act-${String(a.action).toLowerCase()}`}><Icon name={activityIcon(a.action)} size={15} /></span>
                <div className="activity-text">
                  <span className="activity-title">{activityText(a)}</span>
                  <span className="activity-meta">{a.performed_by} · {timeAgo(a.timestamp)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function ForecastToggle({ daily, weekly, total }) {
  const [mode, setMode] = useState('daily');
  const chartData = mode === 'daily' ? daily : weekly;
  return (
    <>
      <div className="forecast-head">
        <span className="forecast-total"><strong>{total}</strong> expected</span>
        <div className="seg">
          <button className={`seg-btn ${mode === 'daily' ? 'active' : ''}`} onClick={() => setMode('daily')}>Daily</button>
          <button className={`seg-btn ${mode === 'weekly' ? 'active' : ''}`} onClick={() => setMode('weekly')}>Weekly</button>
        </div>
      </div>
      <BarChart data={chartData} />
    </>
  );
}

function activityIcon(action) {
  const a = String(action).toLowerCase();
  if (a.includes('payment') || a === 'payment') return 'rupee';
  if (a.includes('renew')) return 'refresh';
  if (a.includes('approve')) return 'check';
  if (a.includes('archive')) return 'archive';
  if (a.includes('customer')) return 'user';
  return 'list';
}
function activityText(a) {
  const name = a.after && a.after.full_name ? ` — ${a.after.full_name}` : '';
  const amt = a.after && a.after.amount ? ` ₹${a.after.amount}` : '';
  const verb = { CREATE: 'Created', UPDATE: 'Updated', RENEW: 'Renewed', APPROVE: 'Approved', CANCEL: 'Cancelled', ARCHIVE: 'Archived', RESTORE: 'Restored', PAYMENT: 'Payment recorded', REFUND: 'Refund recorded', MARK_SENT: 'Marked reminder sent', FOLLOWUP: 'Follow-up updated' }[a.action] || a.action;
  return `${verb} ${String(a.entity_type || '').toLowerCase()}${name}${amt}`;
}
