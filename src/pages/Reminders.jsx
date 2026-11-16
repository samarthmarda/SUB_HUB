// WhatsApp Reminder queue. Reminders are generated automatically; the owner opens
// WhatsApp, sends manually, then marks it sent / records follow-up here.
import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Icon from '../components/Icon';
import { Button, Badge, Select, Spinner, EmptyState, Modal, Field, Textarea, useToast } from '../components/ui';
import { WhatsAppButton } from '../components/WhatsAppButton';
import { useReminders, useSettings, invalidate } from '../swr';
import { api } from '../api';
import { formatDate } from '../lib/format';

const BUCKETS = [
  ['', 'All'], ['today', 'Today'], ['thisweek', 'This week'], ['overdue', 'Overdue'],
  ['notcontacted', 'Not contacted'], ['followuppending', 'Follow-up pending'], ['completed', 'Completed'],
];
const OUTCOMES = ['Pending', 'WhatsApp Clicked', 'Manually Marked Sent', 'Customer Responded', 'Payment Pending', 'Renewed', 'Not Renewing'];
const FOLLOWUPS = ['None', 'Pending', 'Completed'];

export default function Reminders() {
  const [params, setParams] = useSearchParams();
  const bucket = params.get('bucket') || '';
  const toast = useToast();
  const { data: settings } = useSettings();
  const { data, isLoading } = useReminders({ bucket: bucket || undefined });
  const items = (data && data.items) || [];

  const [follow, setFollow] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { api.ensureReminders().catch(() => {}); }, []);

  async function markSent(id) {
    try { await api.markReminderSent(id); await invalidate('reminders', 'dashboard'); toast.success('Marked as sent.'); }
    catch (e) { toast.error(e.message || 'Failed.'); }
  }
  async function saveFollow() {
    if (!follow) return;
    setSaving(true);
    try {
      await api.saveFollowUp(follow.reminder_id, { followup_status: follow.followup_status, status: follow.status, notes: follow.notes });
      await invalidate('reminders', 'dashboard');
      toast.success('Follow-up saved.');
      setFollow(null);
    } catch (e) { toast.error(e.message || 'Failed.'); }
    finally { setSaving(false); }
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="page-title">WhatsApp Reminders</h1>
          <p className="page-sub">Generated automatically · you send manually · {items.length} reminders</p>
        </div>
      </header>

      <div className="tabs tabs-scroll">
        {BUCKETS.map(([b, l]) => (
          <button key={b} className={`tab ${bucket === b ? 'active' : ''}`} onClick={() => setParams(b ? { bucket: b } : {})}>{l}</button>
        ))}
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Customer</th><th>Plan</th><th>Type</th><th>Expiry</th><th>Scheduled</th><th>Status</th><th>Follow-up</th><th>Actions</th></tr></thead>
          <tbody>
            {isLoading && !data && <tr><td colSpan="8"><Spinner /></td></tr>}
            {!isLoading && items.length === 0 && <tr><td colSpan="8"><EmptyState icon="chat" title="No reminders" hint="Reminders appear 7, 3 and 0 days before expiry." /></td></tr>}
            {items.map((r) => (
              <tr key={r.reminder_id}>
                <td>
                  <a className="link-name" href={`#/customers/${r.customer_id}`}><span className="avatar avatar-xs">{r.customer_name.slice(0, 1)}</span> {r.customer_name}</a>
                  <div className="mono muted">{r.phone_e164}</div>
                </td>
                <td>{r.plan_name}</td>
                <td><span className="rtype">{r.reminder_type}</span></td>
                <td>{r.expiry_date ? formatDate(r.expiry_date) : '—'}</td>
                <td>{formatDate(r.scheduled_date)}</td>
                <td><Badge status={r.status} /></td>
                <td><Badge status={r.followup_status} />{r.notes && <div className="sub-badge muted">{r.notes}</div>}</td>
                <td>
                  <div className="row-actions">
                    <WhatsAppButton reminderId={r.reminder_id} label="" variant="wa-icon" />
                    {r.status !== 'Manually Marked Sent' && <button className="icon-btn" title="Mark sent" onClick={() => markSent(r.reminder_id)}><Icon name="check" size={16} /></button>}
                    <button className="icon-btn" title="Follow-up" onClick={() => setFollow({ ...r })}><Icon name="edit" size={16} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal
        open={!!follow}
        onClose={() => setFollow(null)}
        title="Follow-up"
        subtitle={follow ? follow.customer_name : ''}
        size="sm"
        footer={<><Button variant="ghost" onClick={() => setFollow(null)}>Cancel</Button><Button loading={saving} onClick={saveFollow}>Save</Button></>}
      >
        {follow && (
          <div className="form-grid">
            <Field label="Outcome">
              <Select value={follow.status} onChange={(e) => setFollow({ ...follow, status: e.target.value })}>
                {OUTCOMES.map((o) => <option key={o} value={o}>{o}</option>)}
              </Select>
            </Field>
            <Field label="Follow-up status">
              <Select value={follow.followup_status} onChange={(e) => setFollow({ ...follow, followup_status: e.target.value })}>
                {FOLLOWUPS.map((o) => <option key={o} value={o}>{o}</option>)}
              </Select>
            </Field>
            <Field label="Notes" className="span-2">
              <Textarea value={follow.notes || ''} onChange={(e) => setFollow({ ...follow, notes: e.target.value })} placeholder="e.g. Will pay on Friday" />
            </Field>
          </div>
        )}
      </Modal>
    </div>
  );
}
