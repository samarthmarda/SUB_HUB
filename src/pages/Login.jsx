// Login screen with forced first-time password change (RAMESH / JSK).
import React, { useState } from 'react';
import Icon from '../components/Icon';
import { Button, Field, TextInput } from '../components/ui';
import { api, persistLogin, ApiError } from '../api';
import { useToast } from '../components/ui';

export default function Login({ onLogin }) {
  const toast = useToast();
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Forced first-login password change
  const [mustChange, setMustChange] = useState(false);
  const [token, setToken] = useState('');
  const [np, setNp] = useState('');
  const [cp, setCp] = useState('');

  async function signIn(e) {
    e && e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.login(loginId.trim(), password);
      persistLogin(res);
      if (res.mustChangePassword) { setMustChange(true); setToken(res.token); }
      else onLogin(res);
    } catch (err) {
      setError(err.message || 'Login failed.');
    } finally {
      setLoading(false);
    }
  }

  async function changePw(e) {
    e && e.preventDefault();
    setError('');
    if (np.length < 6) { setError('New password must be at least 6 characters.'); return; }
    if (np !== cp) { setError('Passwords do not match.'); return; }
    setLoading(true);
    try {
      await api.changePassword('', np);
      toast.success('Password updated. Welcome!');
      onLogin({ token });
    } catch (err) {
      setError(err.message || 'Could not update password.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-brand">
        <div className="login-logo"><Icon name="trending" size={30} /></div>
        <h1 className="login-title">SUBSCRIPTION HUB</h1>
        <p className="login-tagline">Run your WhatsApp advisory group with clarity — renewals, payments and reminders in one place.</p>
        <ul className="login-points">
          <li><Icon name="check" size={16} /> See who expires today, in 3 and in 7 days</li>
          <li><Icon name="check" size={16} /> Track collections &amp; outstanding balances</li>
          <li><Icon name="check" size={16} /> One-click personalised WhatsApp reminders</li>
        </ul>
      </div>

      <div className="login-card-wrap">
        {!mustChange ? (
          <form className="login-card" onSubmit={signIn}>
            <h2>Administrator sign in</h2>
            <p className="login-sub">Enter your credentials to continue.</p>
            {error && <div className="notice notice-danger"><Icon name="alert" /> {error}</div>}
            <Field label="Login ID" required>
              <TextInput value={loginId} onChange={(e) => setLoginId(e.target.value)} placeholder="RAMESH" autoFocus autoComplete="username" />
            </Field>
            <Field label="Password" required>
              <div className="pw-wrap">
                <TextInput type={showPw ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••" autoComplete="current-password" />
                <button type="button" className="pw-toggle" onClick={() => setShowPw((s) => !s)} aria-label="Toggle password">
                  <Icon name={showPw ? 'x' : 'search'} size={16} />
                </button>
              </div>
            </Field>
            <Button type="submit" loading={loading} block>Sign in</Button>
            <p className="login-hint">First time? Use the temporary credentials provided during setup.</p>
          </form>
        ) : (
          <form className="login-card" onSubmit={changePw}>
            <h2>Choose a new password</h2>
            <p className="login-sub">For security, please replace the temporary password before continuing.</p>
            {error && <div className="notice notice-danger"><Icon name="alert" /> {error}</div>}
            <Field label="New password" required hint="At least 6 characters">
              <TextInput type="password" value={np} onChange={(e) => setNp(e.target.value)} autoFocus autoComplete="new-password" />
            </Field>
            <Field label="Confirm new password" required>
              <TextInput type="password" value={cp} onChange={(e) => setCp(e.target.value)} autoComplete="new-password" />
            </Field>
            <Button type="submit" loading={loading} block>Update &amp; continue</Button>
          </form>
        )}
      </div>
    </div>
  );
}
