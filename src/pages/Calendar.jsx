// Renewal calendar (month / week / day) + list view, with an event drawer.
import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../components/Icon';
import { Button, Badge, Spinner, EmptyState } from '../components/ui';
import { WhatsAppButton } from '../components/WhatsAppButton';
import { useModals } from '../components/ModalsContext';
import { useCalendar, useSettings } from '../swr';
import { formatMoney, formatDate } from '../lib/format';
import { addDays, addMonths, startOfMonth } from '../lib/dates';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const COLOR_LABEL = { green: 'Active / upcoming', yellow: 'Approaching', orange: 'Due today', red: 'Expired', grey: 'Cancelled / archived' };

export default function CalendarPage() {
  const navigate = useNavigate();
  const modals = useModals();
  const { data: settings } = useSettings();
  const symbol = (settings && settings.currency_symbol) || '₹';

  const [view, setView] = useState('month');
  const [anchor, setAnchor] = useState(() => startOfMonth(new Date().toISOString().slice(0, 10)));
  const [listMode, setListMode] = useState(false);
  const [drawer, setDrawer] = useState(null);
  const [expanded, setExpanded] = useState({});

  const { data, isLoading } = useCalendar({ view, anchor });

  function shift(dir) {
    if (view === 'month') setAnchor(addMonths(anchor, dir));
    else if (view === 'week') setAnchor(addDays(anchor, dir * 7));
    else setAnchor(addDays(anchor, dir));
  }
  function today() { setAnchor(view === 'month' ? startOfMonth(new Date().toISOString().slice(0, 10)) : new Date().toISOString().slice(0, 10)); }

  const title = useMemo(() => {
    if (view === 'day') return formatDate(anchor);
    const d = new Date(anchor + 'T00:00:00');
    if (view === 'month') return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    return 'Week of ' + formatDate(anchor);
  }, [view, anchor]);

  const days = (data && data.days) || [];
  const leadPad = view === 'month' && days.length ? (new Date(days[0].date + 'T00:00:00').getDay() + 6) % 7 : 0;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="page-title">Renewal Calendar</h1>
          <p className="page-sub">Subscription expiries from actual records</p>
        </div>
        <div className="cal-controls">
          <div className="seg">
            <button className={`seg-btn ${view === 'month' ? 'active' : ''}`} onClick={() => { setView('month'); setAnchor(startOfMonth(anchor)); }}>Month</button>
            <button className={`seg-btn ${view === 'week' ? 'active' : ''}`} onClick={() => setView('week')}>Week</button>
            <button className={`seg-btn ${view === 'day' ? 'active' : ''}`} onClick={() => setView('day')}>Day</button>
          </div>
          <Button size="sm" variant="secondary" onClick={today}>Today</Button>
          <div className="cal-nav">
            <button className="icon-btn" onClick={() => shift(-1)} aria-label="Previous"><Icon name="external" size={16} style={{ transform: 'rotate(90deg)' }} /></button>
            <span className="cal-title">{title}</span>
            <button className="icon-btn" onClick={() => shift(1)} aria-label="Next"><Icon name="external" size={16} style={{ transform: 'rotate(-90deg)' }} /></button>
          </div>
          <Button size="sm" variant="ghost" onClick={() => setListMode((m) => !m)} icon={<Icon name="list" size={15} />}>{listMode ? 'Calendar' : 'List'}</Button>
        </div>
      </header>

      <div className="cal-legend">
        {Object.entries(COLOR_LABEL).map(([c, l]) => <span key={c} className="legend-item"><span className={`dot dot-${c}`} /> {l}</span>)}
      </div>

      {isLoading && !data && <Spinner />}

      {!listMode && data && (
        <div className={`cal-grid cal-${view}`}>
          {view === 'month' && WEEKDAYS.map((w) => <div key={w} className="cal-weekday">{w}</div>)}
          {Array.from({ length: leadPad }).map((_, i) => <div key={`pad${i}`} className="cal-cell empty" />)}
          {days.map((day) => {
            const isOpen = expanded[day.date];
            const shown = isOpen ? day.events : day.events.slice(0, 3);
            return (
              <div key={day.date} className={`cal-cell ${day.is_today ? 'is-today' : ''} ${day.is_past ? 'is-past' : ''} ${view === 'day' ? 'cell-day' : ''}`}>
                <div className="cal-cell-head">
                  <span className="cal-daynum">{new Date(day.date + 'T00:00:00').getDate()}</span>
                  {day.count > 0 && <span className="cal-count">{day.count}</span>}
                </div>
                <div className="cal-events">
                  {shown.map((ev) => (
                    <button key={ev.subscription_id} className={`cal-event ev-${ev.color}`} onClick={() => setDrawer(ev)} title={`${ev.customer_name} · ${formatMoney(ev.outstanding, symbol)} due`}>
                      <span className="ev-name">{ev.customer_name}</span>
                      {ev.outstanding > 0 && <span className="ev-due">{formatMoney(ev.outstanding, symbol)}</span>}
                    </button>
                  ))}
                  {day.count > 3 && (
                    <button className="cal-more" onClick={() => setExpanded((e) => ({ ...e, [day.date]: !isOpen }))}>
                      {isOpen ? 'Show less' : `+${day.count - 3} more`}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {listMode && data && (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Date</th><th>Customer</th><th>Plan</th><th>Status</th><th className="num">Outstanding</th><th>Actions</th></tr></thead>
            <tbody>
              {data.list.length === 0 && <tr><td colSpan="6"><EmptyState icon="calendar" title="No expiries in this range" /></td></tr>}
              {data.list.map((ev) => (
                <tr key={ev.subscription_id}>
                  <td>{formatDate(ev.date)}</td>
                  <td><a className="link-name" href={`#/customers/${ev.customer_id}`}>{ev.customer_name}</a></td>
                  <td>{ev.plan_name}</td>
                  <td><span className={`dot dot-${ev.color}`} /> {COLOR_LABEL[ev.color]}</td>
                  <td className="num">{ev.outstanding > 0 ? formatMoney(ev.outstanding, symbol) : '—'}</td>
                  <td>
                    <div className="row-actions">
                      <WhatsAppButton customerId={ev.customer_id} label="" variant="wa-icon" />
                      <button className="icon-btn" title="Renew" onClick={() => modals.openRenew(ev.customer_id, ev.subscription_id)}><Icon name="refresh" size={16} /></button>
                      <button className="icon-btn" title="Profile" onClick={() => navigate(`/customers/${ev.customer_id}`)}><Icon name="external" size={16} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {drawer && (
        <div className="drawer-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setDrawer(null); }}>
          <aside className="drawer">
            <header className="drawer-head">
              <div>
                <span className="avatar">{drawer.customer_name.slice(0, 1)}</span>
                <div>
                  <h3>{drawer.customer_name}</h3>
                  <p className="mono muted">{drawer.customer_code} · {drawer.phone_e164}</p>
                </div>
              </div>
              <button className="modal-close" onClick={() => setDrawer(null)}>✕</button>
            </header>
            <div className="drawer-body">
              <div className="detail-list">
                <div><span>Plan</span><strong>{drawer.plan_name}</strong></div>
                <div><span>Renewal date</span><strong>{formatDate(drawer.expiry_date)}</strong></div>
                <div><span>Amount due</span><strong>{formatMoney(drawer.amount_due, symbol)}</strong></div>
                <div><span>Outstanding</span><strong className={drawer.outstanding > 0 ? 'text-danger' : ''}>{formatMoney(drawer.outstanding, symbol)}</strong></div>
                <div><span>Payment status</span><Badge status={drawer.payment_status} /></div>
                <div><span>Status</span><span><span className={`dot dot-${drawer.color}`} /> {COLOR_LABEL[drawer.color]}</span></div>
              </div>
            </div>
            <footer className="drawer-foot">
              <WhatsAppButton customerId={drawer.customer_id} label="WhatsApp" />
              <Button variant="secondary" icon={<Icon name="refresh" size={15} />} onClick={() => { modals.openRenew(drawer.customer_id, drawer.subscription_id); setDrawer(null); }}>Renew</Button>
              <Button variant="ghost" onClick={() => { setDrawer(null); navigate(`/customers/${drawer.customer_id}`); }}>Full profile</Button>
            </footer>
          </aside>
        </div>
      )}
    </div>
  );
}
