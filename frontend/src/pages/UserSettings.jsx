import React, { useContext, useEffect, useMemo, useState } from 'react';
import { AuthContext } from '../AuthContext.jsx';

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
      const payload = { email };
      // allow username change; remove if you want username locked
      if (username) payload.username = username;
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

  if (loading) return <div className="auth-card"><h2>Settings</h2><p>Loading…</p></div>;

  return (
    <div style={{ padding: 24, display: 'grid', gap: 16 }}>
      <h2 style={{ marginTop: 0 }}>User Settings</h2>

      {/* Profile */}
      <div className="card" style={{ padding: 16 }}>
        <h3 style={{ marginTop: 0 }}>Profile</h3>
        <form onSubmit={saveProfile} style={{ display: 'grid', gap: 8, maxWidth: 520 }}>
          <label>
            <div style={{ fontSize: 12, opacity: 0.8 }}>Username</div>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="username"
              required
              autoComplete="username"
            />
          </label>
          <label>
            <div style={{ fontSize: 12, opacity: 0.8 }}>Email (for password resets)</div>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@email.com"
              autoComplete="email"
            />
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button>
            {msg && <span style={{ alignSelf: 'center' }}>{msg}</span>}
          </div>
        </form>
      </div>

      {/* Password */}
      <div className="card" style={{ padding: 16 }}>
        <h3 style={{ marginTop: 0 }}>Change Password</h3>
        <form onSubmit={changePassword} style={{ display: 'grid', gap: 8, maxWidth: 520 }}>
          <label>
            <div style={{ fontSize: 12, opacity: 0.8 }}>Current password</div>
            <input
              type="password"
              value={oldPassword}
              onChange={(e) => setOld(e.target.value)}
              placeholder="current password"
              autoComplete="current-password"
              required
            />
          </label>
          <label>
            <div style={{ fontSize: 12, opacity: 0.8 }}>New password (min 6)</div>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNew(e.target.value)}
              placeholder="new password"
              autoComplete="new-password"
              required
              minLength={6}
            />
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" disabled={pwBusy}>{pwBusy ? 'Updating…' : 'Update password'}</button>
            {pwMsg && <span style={{ alignSelf: 'center' }}>{pwMsg}</span>}
          </div>
        </form>
      </div>
    </div>
  );
}
