// Subscription plans: create, edit, deactivate/reorder. Historical subscriptions
// keep their snapshot, so editing a plan never changes past records.
import React, { useEffect, useState } from 'react';
import Icon from '../components/Icon';
import { Button, Badge, Modal, Field, TextInput, NumberInput, Select, Spinner, EmptyState, ConfirmDialog, useToast } from '../components/ui';
import { usePlans, useSettings, invalidate } from '../swr';
import { api } from '../api';
import { formatMoney } from '../lib/format';

const UNITS = [['DAY', 'Day(s)'], ['WEEK', 'Week(s)'], ['MONTH', 'Month(s)'], ['YEAR', 'Year(s)']];
const blank = { plan_name: '', duration_value: 1, duration_unit: 'MONTH', default_price: '', is_active: true };

export default function Plans() {
  const toast = useToast();
  const { data: plans, isLoading } = usePlans();
  const { data: settings } = useSettings();
  const symbol = (settings && settings.currency_symbol) || '₹';

  const [editing, setEditing] = useState(null); // plan or blank or null
  const [saving, setSaving] = useState(false);
  const [toggleTarget, setToggleTarget] = useState(null);

  function openNew() { setEditing({ ...blank }); }
  function openEdit(p) { setEditing({ ...p }); }

  async function save() {
    setSaving(true);
    try {
      if (editing.plan_id) await api.updatePlan(editing.plan_id, editing);
      else await api.createPlan(editing);
      await invalidate('plans');
      toast.success(editing.plan_id ? 'Plan updated.' : 'Plan created.');
      setEditing(null);
    } catch (e) { toast.error(e.message || 'Could not save plan.'); }
    finally { setSaving(false); }
  }
  async function doToggle() {
    if (!toggleTarget) return;
    try {
      await api.updatePlan(toggleTarget.plan_id, { is_active: !toggleTarget.is_active });
      await invalidate('plans');
      toast.success(toggleTarget.is_active ? 'Plan deactivated.' : 'Plan activated.');
      setToggleTarget(null);
    } catch (e) { toast.error(e.message || 'Failed.'); }
  }

  return (
    <div className="page">
      <header className="page-head">
        <div><h1 className="page-title">Subscription Plans</h1><p className="page-sub">Plans power the New Customer &amp; renewal forms</p></div>
        <Button icon={<Icon name="plus" size={16} />} onClick={openNew}>Add plan</Button>
      </header>

      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Order</th><th>Plan</th><th>Duration</th><th className="num">Default price</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {isLoading && !plans && <tr><td colSpan="6"><Spinner /></td></tr>}
            {plans && plans.length === 0 && <tr><td colSpan="6"><EmptyState icon="tag" title="No plans" action={<Button size="sm" onClick={openNew}>Add plan</Button>} /></td></tr>}
            {(plans || []).map((p) => (
              <tr key={p.plan_id}>
                <td className="mono">{p.display_order}</td>
                <td><strong>{p.plan_name}</strong></td>
                <td>{p.duration_value} {String(p.duration_unit).toLowerCase()}</td>
                <td className="num">{formatMoney(p.default_price, symbol)}</td>
                <td><Badge status={p.is_active ? 'Approved' : 'Cancelled'}>{p.is_active ? 'Active' : 'Inactive'}</Badge></td>
                <td>
                  <div className="row-actions">
                    <button className="icon-btn" title="Edit" onClick={() => openEdit(p)}><Icon name="edit" size={16} /></button>
                    <button className="icon-btn" title={p.is_active ? 'Deactivate' : 'Activate'} onClick={() => setToggleTarget(p)}><Icon name={p.is_active ? 'archive' : 'check'} size={16} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing && editing.plan_id ? 'Edit plan' : 'New plan'}
        size="sm"
        footer={<><Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button><Button loading={saving} onClick={save}>Save</Button></>}
      >
        {editing && (
          <div className="form-grid">
            <Field label="Plan name" required className="span-2"><TextInput value={editing.plan_name} onChange={(e) => setEditing({ ...editing, plan_name: e.target.value })} autoFocus /></Field>
            <Field label="Duration value" required><NumberInput value={editing.duration_value} min="1" onChange={(e) => setEditing({ ...editing, duration_value: e.target.value })} /></Field>
            <Field label="Duration unit" required>
              <Select value={editing.duration_unit} onChange={(e) => setEditing({ ...editing, duration_unit: e.target.value })}>
                {UNITS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </Select>
            </Field>
            <Field label="Default price"><NumberInput value={editing.default_price} min="0" onChange={(e) => setEditing({ ...editing, default_price: e.target.value })} /></Field>
          </div>
        )}
      </Modal>

      <ConfirmDialog open={!!toggleTarget} onClose={() => setToggleTarget(null)} onConfirm={doToggle} danger={toggleTarget && toggleTarget.is_active} title={toggleTarget && toggleTarget.is_active ? 'Deactivate plan?' : 'Activate plan?'} confirmLabel={toggleTarget && toggleTarget.is_active ? 'Deactivate' : 'Activate'} message={toggleTarget && toggleTarget.is_active ? 'Inactive plans are hidden from new-customer and renewal forms. Existing subscriptions are unaffected.' : 'Make this plan available again in the forms.'} />
    </div>
  );
}
