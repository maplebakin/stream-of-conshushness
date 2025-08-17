// src/pages/UserSettings.jsx
import React, { useContext, useEffect, useMemo, useState } from 'react';
import { AuthContext } from '../AuthContext.jsx';
import '../Settings.css';

function useAuthedFetch(token) {
  return useMemo(
    () => async (path, opts = {}) => {
      const res = await fetch(path, {
        ...opts,
        headers: {
          'Content-Type': 'application/json',
          ...(opts.headers || {}),
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Request failed: ${res.status}`);
      return data;
    },
    [token]
  );
}

export default function UserSettings() {
  const { token } = useContext(AuthContext);
  const api = useAuthedFetch(token);

  // profile state
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');

  // password state
  const [oldPassword, setOld] = useState('');
  const [newPassword, setNew] = useState('');
  const [pwMsg, setPwMsg] = useState('');
  const [pwBusy, setPwBusy] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { user } = await api('/api/me');
        if (!mounted) return;
        setUsername(user?.username || '');
        setEmail(user?.email || '');
      } catch (e) {
        setMsg(e.message);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [api]);

  async function saveProfile(e) {
    e?.preventDefault?.();
    setMsg('');
    setSaving(true);
    try {
      const payload = { email, username };
      const { user } = await api('/api/me', {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      setUsername(user.username);
      setEmail(user.email || '');
      setMsg('Profile updated.');
    } catch (e) {
      setMsg(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function changePassword(e) {
    e?.preventDefault?.();
    setPwMsg('');
    setPwBusy(true);
    try {
      await api('/api/change-password', {
        method: 'POST',
        body: JSON.stringify({ oldPassword, newPassword }),
      });
      setOld(''); setNew('');
      setPwMsg('Password updated.');
    } catch (e) {
      setPwMsg(e.message);
    } finally {
      setPwBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="settings-wrap">
        <div className="settings-header">
          <h2 className="font-echo text-vein text-2xl">Settings</h2>
          <p className="text-muted">Loading your profile…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="settings-wrap">
      <div className="settings-header">
        <h2 className="font-echo text-vein text-2xl sm:text-3xl">User Settings</h2>
        <p className="text-muted">Keep your account info tidy and your password spicy.</p>
      </div>

      <div className="settings-grid">
        {/* Profile card */}
        <section className="settings-card">
          <h3 className="section-title">⚙️ Profile</h3>
          <form onSubmit={saveProfile} className="form-grid" noValidate>
            <label className="field">
              <span className="field-label">Username</span>
              <input
                className="input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="username"
                required
                autoComplete="username"
              />
            </label>

            <label className="field">
              <span className="field-label">Email (for password resets)</span>
              <input
                className="input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@domain.com"
                autoComplete="email"
              />
            </label>

            <div className="button-row">
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Saving…' : 'Save changes'}
              </button>
              {msg && <span className="note note-success">{msg}</span>}
            </div>
          </form>
        </section>

        {/* Password card */}
        <section className="settings-card">
          <h3 className="section-title">🔐 Change Password</h3>
          <form onSubmit={changePassword} className="form-grid" noValidate>
            <label className="field">
              <span className="field-label">Current password</span>
              <input
                className="input"
                type="password"
                value={oldPassword}
                onChange={(e) => setOld(e.target.value)}
                placeholder="current password"
                autoComplete="current-password"
                required
              />
            </label>

            <label className="field">
              <span className="field-label">New password (min 6)</span>
              <input
                className="input"
                type="password"
                value={newPassword}
                onChange={(e) => setNew(e.target.value)}
                placeholder="new password"
                autoComplete="new-password"
                required
                minLength={6}
              />
            </label>

            <div className="button-row">
              <button type="submit" className="btn btn-primary" disabled={pwBusy}>
                {pwBusy ? 'Updating…' : 'Update password'}
              </button>
              {pwMsg && <span className="note note-success">{pwMsg}</span>}
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
