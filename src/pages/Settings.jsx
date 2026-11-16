// Settings: business info, WhatsApp templates, reminder schedule + trigger,
// administrator credentials and manual backup.
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../components/Icon';
import { Button, Field, TextInput, Textarea, Select, Spinner, useToast } from '../components/ui';
import { useSettings, useTriggerStatus, invalidate } from '../swr';
import { api } from '../api';

export default function Settings() {
  const toast = useToast();
  const navigate = useNavigate();
  const { data: settings, isLoading } = useSettings();
  const { data: triggers } = useTriggerStatus();

  const [biz, setBiz] = useState(null);
  const [tpl, setTpl] = useState(null);
  const [rem, setRem] = useState(null);
  const [pw, setPw] = useState({ old: '', new: '', confirm: '' });
  const [loginId, setLoginId] = useState('');
  const [saving, setSaving] = useState('');
  const [backupUrl, setBackupUrl] = useState('');

  useEffect(() => {
    if (settings) {
      setBiz({
        business_name: settings.business_name || '', currency: settings.currency || 'INR',
        currency_symbol: settings.currency_symbol || '₹', default_country_code: settings.default_country_code || '91',
        timezone: settings.timezone || 'Asia/Kolkata', customer_capacity: settings.customer_capacity || '500',
      });
      setTpl({
        whatsapp_template_7day: settings.whatsapp_template_7day || '',
        whatsapp_template_3day: settings.whatsapp_template_3day || '',
        whatsapp_template_expiryday: settings.whatsapp_template_expiryday || '',
        whatsapp_template_expired: settings.whatsapp_template_expired || '',
      });
      setRem({ reminder_enabled: settings.reminder_enabled || 'true', reminder_days_before: settings.reminder_days_before || '7,3,0', reminder_hour: settings.reminder_hour || '9' });
    }
  }, [settings]);

  async function saveSection(key, patch) {
    setSaving(key);
    try {
      await api.updateSettings(patch);
      await invalidate('settings', 'dashboard');
      toast.success('Settings saved.');
    } catch (e) { toast.error(e.message || 'Save failed.'); }
    finally { setSaving(''); }
  }
  async function changePw() {
    if (pw.new.length < 6) { toast.error('New password must be at least 6 characters.'); return; }
    if (pw.new !== pw.confirm) { toast.error('Passwords do not match.'); return; }
    setSaving('pw');
    try { await api.changePassword(pw.old, pw.new); toast.success('Password changed.'); setPw({ old: '', new: '', confirm: '' }); }
    catch (e) { toast.error(e.message || 'Could not change password.'); }
    finally { setSaving(''); }
  }
  async function changeLogin() {
    setSaving('login');
    try { await api.changeLoginId(loginId); toast.success('Login ID updated.'); setLoginId(''); }
    catch (e) { toast.error(e.message || 'Could not change login ID.'); }
    finally { setSaving(''); }
  }
  async function backup() {
    setSaving('backup');
    try { const r = await api.createBackup(); setBackupUrl(r.url); toast.success('Backup created.'); }
    catch (e) { toast.error(e.message || 'Backup failed.'); }
    finally { setSaving(''); }
  }

  if (isLoading && !settings) return <div className="page"><Spinner label="Loading settings…" /></div>;
  if (!biz || !tpl || !rem) return <div className="page"><Spinner /></div>;

  return (
    <div className="page settings-page">
      <header className="page-head"><div><h1 className="page-title">Settings</h1><p className="panel-sub">Configure your business, reminders and account</p></div></header>

      <div className="settings-grid">
        <section className="panel">
          <header className="panel-head"><h3 className="panel-title">Business information</h3></header>
          <div className="panel-body">
            <div className="form-grid">
              <Field label="Business name"><TextInput value={biz.business_name} onChange={(e) => setBiz({ ...biz, business_name: e.target.value })} /></Field>
              <Field label="Currency"><TextInput value={biz.currency} onChange={(e) => setBiz({ ...biz, currency: e.target.value })} /></Field>
              <Field label="Currency symbol"><TextInput value={biz.currency_symbol} onChange={(e) => setBiz({ ...biz, currency_symbol: e.target.value })} /></Field>
              <Field label="Default country code"><TextInput value={biz.default_country_code} onChange={(e) => setBiz({ ...biz, default_country_code: e.target.value })} /></Field>
              <Field label="Timezone"><TextInput value={biz.timezone} onChange={(e) => setBiz({ ...biz, timezone: e.target.value })} /></Field>
              <Field label="Customer capacity"><TextInput value={biz.customer_capacity} onChange={(e) => setBiz({ ...biz, customer_capacity: e.target.value })} /></Field>
            </div>
            <div className="panel-foot">
              <Button loading={saving === 'biz'} onClick={() => saveSection('biz', biz)}>Save business info</Button>
            </div>
          </div>
        </section>

        <section className="panel">
          <header className="panel-head"><h3 className="panel-title">Subscription plans</h3></header>
          <div className="panel-body">
            <p className="muted">Plans drive the New Customer and renewal forms. Historical subscriptions keep their own snapshot.</p>
            <Button variant="secondary" icon={<Icon name="tag" size={15} />} onClick={() => navigate('/plans')}>Manage plans</Button>
          </div>
        </section>

        <section className="panel span-2">
          <header className="panel-head"><h3 className="panel-title">WhatsApp templates</h3></header>
          <div className="panel-body">
            <p className="muted">Variables: {'{{customer_name}}'}, {'{{expiry_date}}'}</p>
            <Field label="Seven-day reminder"><Textarea value={tpl.whatsapp_template_7day} onChange={(e) => setTpl({ ...tpl, whatsapp_template_7day: e.target.value })} /></Field>
            <Field label="Three-day reminder"><Textarea value={tpl.whatsapp_template_3day} onChange={(e) => setTpl({ ...tpl, whatsapp_template_3day: e.target.value })} /></Field>
            <Field label="Expiry-day reminder"><Textarea value={tpl.whatsapp_template_expiryday} onChange={(e) => setTpl({ ...tpl, whatsapp_template_expiryday: e.target.value })} /></Field>
            <Field label="Expired subscription"><Textarea value={tpl.whatsapp_template_expired} onChange={(e) => setTpl({ ...tpl, whatsapp_template_expired: e.target.value })} /></Field>
            <div className="panel-foot"><Button loading={saving === 'tpl'} onClick={() => saveSection('tpl', tpl)}>Save templates</Button></div>
          </div>
        </section>

        <section className="panel">
          <header className="panel-head"><h3 className="panel-title">Reminders</h3></header>
          <div className="panel-body">
            <div className="form-grid">
              <Field label="Enable reminders">
                <Select value={rem.reminder_enabled} onChange={(e) => setRem({ ...rem, reminder_enabled: e.target.value })}>
                  <option value="true">Enabled</option><option value="false">Disabled</option>
                </Select>
              </Field>
              <Field label="Reminder days before expiry" hint="Comma-separated, e.g. 7,3,0"><TextInput value={rem.reminder_days_before} onChange={(e) => setRem({ ...rem, reminder_days_before: e.target.value })} /></Field>
              <Field label="Trigger hour (0–23, Asia/Kolkata)"><TextInput value={rem.reminder_hour} onChange={(e) => setRem({ ...rem, reminder_hour: e.target.value })} /></Field>
            </div>
            <div className="trigger-status">
              <span className={`pill ${triggers && triggers.installed ? 'pill-ok' : 'pill-warn'}`}>
                {triggers && triggers.installed ? `Daily trigger active at ${triggers.reminder_trigger.hour}:00` : 'No reminder trigger installed'}
              </span>
              <Button size="sm" variant="secondary" onClick={async () => { try { await api.installReminderTrigger(); await invalidate('triggers'); toast.success('Trigger installed.'); } catch (e) { toast.error('Failed.'); } }}>Install / refresh trigger</Button>
            </div>
            <div className="panel-foot"><Button loading={saving === 'rem'} onClick={() => saveSection('rem', rem)}>Save reminder settings</Button></div>
          </div>
        </section>

        <section className="panel">
          <header className="panel-head"><h3 className="panel-title">Administrator</h3></header>
          <div className="panel-body">
            <Field label="Current password"><TextInput type="password" value={pw.old} onChange={(e) => setPw({ ...pw, old: e.target.value })} autoComplete="current-password" /></Field>
            <Field label="New password"><TextInput type="password" value={pw.new} onChange={(e) => setPw({ ...pw, new: e.target.value })} autoComplete="new-password" /></Field>
            <Field label="Confirm new password"><TextInput type="password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} autoComplete="new-password" /></Field>
            <div className="panel-foot"><Button loading={saving === 'pw'} onClick={changePw}>Change password</Button></div>
            <hr />
            <Field label="Change login ID"><TextInput value={loginId} onChange={(e) => setLoginId(e.target.value)} placeholder="New login ID" /></Field>
            <div className="panel-foot"><Button variant="secondary" loading={saving === 'login'} onClick={changeLogin}>Update login ID</Button></div>
          </div>
        </section>

        <section className="panel">
          <header className="panel-head"><h3 className="panel-title">Backup</h3></header>
          <div className="panel-body">
            <p className="muted">Create a dated copy of the database in Google Drive. A weekly backup runs automatically (keeps the last {8}).</p>
            <Button loading={saving === 'backup'} icon={<Icon name="backup" size={15} />} onClick={backup}>Create backup now</Button>
            {backupUrl && <p className="backup-link"><a href={backupUrl} target="_blank" rel="noreferrer">Open latest backup ↗</a></p>}
          </div>
        </section>
      </div>
    </div>
  );
}
