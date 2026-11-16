// App shell: persistent sidebar (collapsible drawer on mobile) + top navigation
// with global search, business date, sync time, notifications and profile menu.
import React, { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import Icon from './Icon';
import { useModals } from './ModalsContext';
import { useLastSync, useDashboard, invalidateAll } from '../swr';
import { api, logoutAndClear } from '../api';
import { clearSession, getLoginId } from '../lib/session';
import { formatDateLong, todayISO, initials } from '../lib/format';
import { useDebounced } from './ui';

const NAV = [
  { group: 'General', items: [{ to: '/', label: 'Dashboard', icon: 'dashboard', end: true }] },
  {
    group: 'Customer management', items: [
      { to: '/customers', label: 'Customers', icon: 'users' },
      { to: '/plans', label: 'Subscription Plans', icon: 'tag' },
      { to: '/subscriptions', label: 'Subscriptions', icon: 'list' },
    ],
  },
  {
    group: 'Renewal management', items: [
      { to: '/renewals', label: 'Renewals', icon: 'refresh' },
      { to: '/calendar', label: 'Renewal Calendar', icon: 'calendar' },
      { to: '/reminders', label: 'WhatsApp Reminders', icon: 'chat' },
    ],
  },
  {
    group: 'Finance', items: [
      { to: '/payments', label: 'Payments & Dues', icon: 'wallet' },
      { to: '/reports', label: 'Reports', icon: 'chart' },
    ],
  },
  {
    group: 'System', items: [
      { to: '/settings', label: 'Settings', icon: 'settings' },
    ],
  },
];

function GlobalSearch() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState(null);
  const dq = useDebounced(q, 300);
  const boxRef = useRef(null);

  useEffect(() => {
    let active = true;
    if (!dq || dq.trim().length < 1) { setResults(null); return undefined; }
    api.search(dq).then((r) => { if (active) { setResults(r); setOpen(true); } }).catch(() => {});
    return () => { active = false; };
  }, [dq]);

  useEffect(() => {
    const onClick = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const has = results && ((results.customers && results.customers.length) || (results.subscriptions && results.subscriptions.length));
  return (
    <div className="gsearch" ref={boxRef}>
      <Icon name="search" size={16} />
      <input
        className="gsearch-input"
        placeholder="Search customers, phone, ID…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => results && setOpen(true)}
      />
      {open && has && (
        <div className="gsearch-dropdown">
          {results.customers && results.customers.length > 0 && (
            <>
              <div className="gsearch-group">Customers</div>
              {results.customers.map((c) => (
                <button key={c.customer_id} className="gsearch-item" onClick={() => { setOpen(false); setQ(''); navigate(`/customers/${c.customer_id}`); }}>
                  <span className="avatar avatar-xs">{initials(c.full_name)}</span>
                  <span className="gsearch-name">{c.full_name}</span>
                  <span className="gsearch-meta">{c.customer_code} · {c.phone_e164}</span>
                </button>
              ))}
            </>
          )}
          {results.subscriptions && results.subscriptions.length > 0 && (
            <>
              <div className="gsearch-group">Subscriptions</div>
              {results.subscriptions.map((s) => (
                <button key={s.subscription_id} className="gsearch-item" onClick={() => { setOpen(false); setQ(''); navigate(`/customers/${s.customer_id}`); }}>
                  <Icon name="list" size={14} />
                  <span className="gsearch-name">{s.customer_name}</span>
                  <span className="gsearch-meta">{s.plan_name}</span>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function SyncBadge() {
  const last = useLastSync();
  const label = last ? 'Synced ' + new Date(last).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'Syncing…';
  return <span className="sync-badge" title={last || ''}><span className="sync-dot" /> {label}</span>;
}

function NotificationsBell() {
  const { data } = useDashboard('30d');
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const aq = (data && data.action_queue) || {};
  const total = (aq.renewals_today || 0) + (aq.expired_customers || 0) + (aq.pending_approvals || 0);
  const items = [
    { label: `${aq.renewals_today || 0} renewal${aq.renewals_today === 1 ? '' : 's'} due today`, to: '/renewals?view=today' },
    { label: `${aq.renewals_3days || 0} due in 3 days`, to: '/renewals?view=3days' },
    { label: `${aq.expired_customers || 0} expired customer${aq.expired_customers === 1 ? '' : 's'}`, to: '/renewals?view=overdue' },
    { label: `${aq.pending_approvals || 0} pending approval${aq.pending_approvals === 1 ? '' : 's'}`, to: '/subscriptions?status=Pending Approval' },
    { label: `${aq.followups_pending || 0} follow-up${aq.followups_pending === 1 ? '' : 's'} pending`, to: '/reminders?bucket=followuppending' },
  ];
  return (
    <div className="bell" onMouseDown={(e) => e.stopPropagation()}>
      <button className="icon-btn" onClick={() => setOpen((o) => !o)} aria-label="Notifications">
        <Icon name="bell" size={18} />
        {total > 0 && <span className="bell-dot">{total}</span>}
      </button>
      {open && (
        <div className="bell-menu" onMouseDown={(e) => e.stopPropagation()}>
          <div className="bell-head">Action queue</div>
          {items.map((it, i) => (
            <button key={i} className="bell-item" onClick={() => { setOpen(false); navigate(it.to); }}>{it.label}</button>
          ))}
          <button className="bell-item bell-all" onClick={() => { setOpen(false); navigate('/renewals'); }}>View all renewals →</button>
        </div>
      )}
    </div>
  );
}

function ProfileMenu() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const loginId = getLoginId() || 'admin';
  async function logout() {
    await logoutAndClear();
  }
  return (
    <div className="profile" onMouseDown={(e) => e.stopPropagation()}>
      <button className="profile-btn" onClick={() => setOpen((o) => !o)}>
        <span className="avatar">{initials(loginId)}</span>
        <span className="profile-name">{loginId}</span>
        <span className="chev">▾</span>
      </button>
      {open && (
        <div className="profile-menu" onMouseDown={(e) => e.stopPropagation()}>
          <button className="profile-item" onClick={() => { setOpen(false); navigate('/settings'); }}><Icon name="settings" size={15} /> Settings</button>
          <button className="profile-item danger" onClick={logout}><Icon name="logout" size={15} /> Logout</button>
        </div>
      )}
    </div>
  );
}

export default function Layout() {
  const modals = useModals();
  const location = useLocation();
  const [drawer, setDrawer] = useState(false);
  const { data: dash } = useDashboard('30d');
  const businessName = (dash && dash.business_name) || 'SUBSCRIPTION HUB';

  useEffect(() => { setDrawer(false); }, [location.pathname]);

  return (
    <div className="app-shell">
      <aside className={`sidebar ${drawer ? 'open' : ''}`}>
        <div className="brand">
          <span className="brand-mark"><Icon name="trending" size={20} /></span>
          <span className="brand-text">SUBSCRIPTION<br /><small>HUB</small></span>
        </div>
        <nav className="nav">
          {NAV.map((section) => (
            <div key={section.group} className="nav-group">
              <div className="nav-group-title">{section.group}</div>
              {section.items.map((item) => (
                <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                  <Icon name={item.icon} size={18} />
                  <span>{item.label}</span>
                </NavLink>
              ))}
              {section.group === 'System' && (
                <button className="nav-link nav-logout" onClick={() => logoutAndClear()}>
                  <Icon name="logout" size={18} /><span>Logout</span>
                </button>
              )}
            </div>
          ))}
        </nav>
        <div className="sidebar-foot">
          <span className="capacity-mini">
            {dash && dash.capacity ? `${dash.capacity.active} / ${dash.capacity.capacity} members` : '—'}
          </span>
        </div>
      </aside>
      {drawer && <div className="drawer-overlay" onClick={() => setDrawer(false)} />}

      <div className="main">
        <header className="topbar">
          <button className="icon-btn hamburger" onClick={() => setDrawer((d) => !d)} aria-label="Menu"><Icon name="menu" size={20} /></button>
          <GlobalSearch />
          <div className="topbar-right">
            <span className="topbar-date"><Icon name="calendar" size={15} /> {formatDateLong(todayISO())}</span>
            <SyncBadge />
            <NotificationsBell />
            <button className="btn btn-primary btn-sm new-customer-btn" onClick={modals.openNewCustomer}>
              <Icon name="plus" size={16} /> <span>New Customer</span>
            </button>
            <ProfileMenu />
          </div>
        </header>
        <main className="content">
          <Outlet context={{ businessName }} />
        </main>
      </div>
    </div>
  );
}
