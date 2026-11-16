// Customer directory: searchable, filterable, sortable, paginated table with
// view / WhatsApp / edit / archive actions.
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Icon from '../components/Icon';
import { Button, Badge, Select, TextInput, Spinner, EmptyState, ConfirmDialog, useToast, useDebounced } from '../components/ui';
import { WhatsAppButton } from '../components/WhatsAppButton';
import { useModals } from '../components/ModalsContext';
import { useCustomers, useSettings, invalidate } from '../swr';
import { api, ApiError } from '../api';
import { formatMoney, formatDate, daysLabel } from '../lib/format';

const STATUSES = ['Active', 'Expired', 'Upcoming', 'No Subscription'];

export default function Customers() {
  const navigate = useNavigate();
  const toast = useToast();
  const modals = useModals();
  const [params, setParams] = useSearchParams();
  const { data: settings } = useSettings();
  const symbol = (settings && settings.currency_symbol) || '₹';

  const [search, setSearch] = useState(params.get('q') || '');
  const dsearch = useDebounced(search, 350);
  const [status, setStatus] = useState(params.get('status') || '');
  const [expiry, setExpiry] = useState(params.get('expiry') || '');
  const [outstanding, setOutstanding] = useState(params.get('due') === '1');
  const [sortBy, setSortBy] = useState('expiry_date');
  const [sortDir, setSortDir] = useState('asc');
  const [page, setPage] = useState(1);

  const [archiveTarget, setArchiveTarget] = useState(null);
  const [archiving, setArchiving] = useState(false);

  const query = useMemo(() => ({
    search: dsearch, status, expiring_within_days: expiry || undefined,
    has_outstanding: outstanding ? true : undefined, sort_by: sortBy, sort_dir: sortDir, page, page_size: 25,
  }), [dsearch, status, expiry, outstanding, sortBy, sortDir, page]);

  const { data, error, isLoading } = useCustomers(query);

  useEffect(() => { setPage(1); }, [dsearch, status, expiry, outstanding]);

  function sort(col) {
    if (sortBy === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortBy(col); setSortDir('asc'); }
  }

  async function doArchive() {
    if (!archiveTarget) return;
    setArchiving(true);
    try {
      await api.archiveCustomer(archiveTarget.customer_id, !archiveTarget.is_archived);
      await invalidate('customers', 'dashboard', 'capacity');
      toast.success(archiveTarget.is_archived ? 'Customer restored.' : 'Customer archived.');
      setArchiveTarget(null);
    } catch (e) { toast.error(e.message || 'Action failed.'); }
    finally { setArchiving(false); }
  }

  const items = (data && data.items) || [];
  const total = (data && data.total) || 0;
  const totalPages = Math.max(1, Math.ceil(total / 25));

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="page-title">Customers</h1>
          <p className="page-sub">{data && data.capacity ? `${data.capacity.active} / ${data.capacity.capacity} members` : 'Loading…'}</p>
        </div>
        <Button icon={<Icon name="plus" size={16} />} onClick={modals.openNewCustomer}>New Customer</Button>
      </header>

      <div className="toolbar">
        <div className="toolbar-search">
          <Icon name="search" size={16} />
          <TextInput placeholder="Search name, phone, code…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
        <Select value={expiry} onChange={(e) => setExpiry(e.target.value)} aria-label="Expiry">
          <option value="">Any expiry</option>
          <option value="7">Expiring in 7 days</option>
          <option value="30">Expiring in 30 days</option>
        </Select>
        <label className="check-inline">
          <input type="checkbox" checked={outstanding} onChange={(e) => setOutstanding(e.target.checked)} />
          <span>Has balance</span>
        </label>
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th className="sortable" onClick={() => sort('customer_code')}>ID</th>
              <th className="sortable" onClick={() => sort('name')}>Name</th>
              <th>Phone</th>
              <th>Plan</th>
              <th className="sortable" onClick={() => sort('joined_date')}>Start</th>
              <th className="sortable" onClick={() => sort('expiry_date')}>Expiry</th>
              <th className="num">Amount</th>
              <th className="num">Paid</th>
              <th className="num sortable" onClick={() => sort('outstanding')}>Outstanding</th>
              <th>Status</th>
              <th className="actions-col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && !data && <tr><td colSpan="11"><Spinner /></td></tr>}
            {!isLoading && items.length === 0 && (
              <tr><td colSpan="11"><EmptyState icon="users" title="No customers found" hint="Adjust filters or add a new customer." action={<Button size="sm" onClick={modals.openNewCustomer}>New Customer</Button>} /></td></tr>
            )}
            {items.map((c) => (
              <tr key={c.customer_id}>
                <td><span className="mono">{c.customer_code}</span></td>
                <td>
                  <button className="link-name" onClick={() => navigate(`/customers/${c.customer_id}`)}>
                    <span className="avatar avatar-xs">{c.full_name.slice(0, 1)}</span> {c.full_name}
                  </button>
                </td>
                <td className="mono">{c.phone_e164}</td>
                <td>{c.current_plan || '—'}</td>
                <td>{c.subscription_start ? formatDate(c.subscription_start) : '—'}</td>
                <td>
                  {c.expiry_date ? (<><div>{formatDate(c.expiry_date)}</div><small className="muted">{daysLabel(c.days_to_expiry)}</small></>) : '—'}
                </td>
                <td className="num">{formatMoney(c.subscription_amount, symbol)}</td>
                <td className="num">{formatMoney(c.amount_paid, symbol)}</td>
                <td className="num">{c.outstanding > 0 ? <strong className="text-danger">{formatMoney(c.outstanding, symbol)}</strong> : formatMoney(0, symbol)}</td>
                <td><Badge status={c.date_status} />{c.payment_status && c.payment_status !== 'Paid' && <div className="sub-badge"><Badge status={c.payment_status} /></div>}</td>
                <td className="actions-col">
                  <div className="row-actions">
                    <WhatsAppButton customerId={c.customer_id} label="" variant="wa-icon" />
                    <button className="icon-btn" title="Edit" onClick={() => modals.openEditCustomer(c.customer_id)}><Icon name="edit" size={16} /></button>
                    <button className="icon-btn" title={c.is_archived ? 'Restore' : 'Archive'} onClick={() => setArchiveTarget(c)}><Icon name="archive" size={16} /></button>
                    <button className="icon-btn" title="View profile" onClick={() => navigate(`/customers/${c.customer_id}`)}><Icon name="external" size={16} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {total > 0 && (
        <div className="pagination">
          <span className="muted">Showing {items.length} of {total}</span>
          <div className="pager">
            <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</Button>
            <span className="page-num">Page {page} / {totalPages}</span>
            <Button size="sm" variant="secondary" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!archiveTarget}
        onClose={() => setArchiveTarget(null)}
        onConfirm={doArchive}
        loading={archiving}
        danger={archiveTarget && !archiveTarget.is_archived}
        title={archiveTarget && archiveTarget.is_archived ? 'Restore customer?' : 'Archive customer?'}
        confirmLabel={archiveTarget && archiveTarget.is_archived ? 'Restore' : 'Archive'}
        message={archiveTarget && archiveTarget.is_archived
          ? `Restore ${archiveTarget.full_name}? They will count toward your member capacity again.`
          : `Archive ${archiveTarget && archiveTarget.full_name}? Their subscription and payment history is kept, and a capacity slot is freed. You can restore them later.`}
      />
    </div>
  );
}
