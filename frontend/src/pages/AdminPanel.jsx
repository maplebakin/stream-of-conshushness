import React, { useContext, useEffect, useMemo, useState } from 'react';
import { AuthContext } from '../AuthContext.jsx';

function useAuthedFetch(token) {
  return async function authed(path, opts = {}) {
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
  };
}

export default function AdminPanel() {
  const { token } = useContext(AuthContext);
  const api = useMemo(() => useAuthedFetch(token), [token]);

  const [isAdmin, setIsAdmin] = useState(null);
  const [q, setQ] = useState('');
  const [users, setUsers] = useState([]);
  const [cursor, setCursor] = useState('');
  const [nextCursor, setNextCursor] = useState(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  // Reset form state
  const [targetUser, setTargetUser] = useState('');
  const [newPassword, setNewPassword] = useState('');

  // Check admin
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const me = await api('/api/admin/me');
        if (mounted) setIsAdmin(!!me?.user?.isAdmin);
      } catch {
        if (mounted) setIsAdmin(false);
      }
    })();
    return () => (mounted = false);
  }, [api]);

  async function loadUsers(reset = false) {
    setLoading(true);
    setMsg('');
    try {
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      if (!reset && cursor) params.set('cursor', cursor);
      params.set('limit', '25');

      const data = await api(`/api/admin/users?${params.toString()}`);
      const merged = reset ? data.users : [...users, ...data.users];
      setUsers(merged);
      setNextCursor(data.nextCursor || null);
      setCursor(data.nextCursor || '');
    } catch (e) {
      setMsg(e.message);
    } finally {
      setLoading(false);
    }
  }

  function doSearch(e) {
    e.preventDefault();
    setCursor('');
    loadUsers(true);
  }

  async function doReset(e) {
    e.preventDefault();
    setMsg('');
    try {
      await api('/api/admin/users/reset-password', {
        method: 'POST',
        body: JSON.stringify({ username: targetUser, newPassword }),
      });
      setMsg(`Password reset for @${targetUser}.`);
      setNewPassword('');
    } catch (e) {
      setMsg(e.message);
    }
  }

  if (isAdmin === null) {
    return <div className="auth-card"><h2>Admin</h2><p>Checking admin rights…</p></div>;
  }
  if (!isAdmin) {
    return <div className="auth-card"><h2>Admin</h2><p>Nope. You’re not an admin.</p></div>;
  }

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ marginTop: 0 }}>Admin Panel</h2>

      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>Reset a user's password</h3>
        <form onSubmit={doReset} style={{ display: 'grid', gap: 8, maxWidth: 420 }}>
          <input
            placeholder="username"
            value={targetUser}
            onChange={(e) => setTargetUser(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="new password (min 6)"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            minLength={6}
            required
          />
          <button type="submit">Reset Password</button>
        </form>
      </div>

      <div className="card" style={{ padding: 16 }}>
        <h3 style={{ marginTop: 0 }}>Users</h3>
        <form onSubmit={doSearch} style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input placeholder="search by username" value={q} onChange={(e) => setQ(e.target.value)} />
          <button type="submit">Search</button>
          <button type="button" onClick={() => { setQ(''); setUsers([]); setCursor(''); setNextCursor(null); }}>Clear</button>
        </form>

        {users.length === 0 && <p style={{ color: 'var(--color-muted)' }}>No users loaded yet.</p>}

        {users.length > 0 && (
          <div style={{ display: 'grid', gap: 8 }}>
            {users.map(u => (
              <div key={u._id} style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <div>
                    <b>@{u.username}</b>
                    {u.isAdmin && <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--color-accent-dark)' }}>admin</span>}
                    {u.email && <div style={{ fontSize: 12 }}>{u.email}</div>}
                  </div>
                  <button
                    onClick={() => setTargetUser(u.username)}
                    title="Load username into reset form"
                  >
                    Select
                  </button>
                </div>
              </div>
            ))}
            {nextCursor && (
              <button onClick={() => loadUsers(false)} disabled={loading}>
                {loading ? 'Loading…' : 'Load more'}
              </button>
            )}
          </div>
        )}
      </div>

      {msg && <p style={{ marginTop: 12 }}>{msg}</p>}
    </div>
  );
}
