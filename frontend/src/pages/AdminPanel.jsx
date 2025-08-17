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
  const { token, user } = useContext(AuthContext);
  const api = useAuthedFetch(token);

  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  // list state
  const [q, setQ] = useState('');
  const [users, setUsers] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [busyList, setBusyList] = useState(false);

  // per-row new password inputs
  const [pwMap, setPwMap] = useState({}); // { userId: 'newpass' }

  // quick reset by username
  const [targetUser, setTargetUser] = useState('');
  const [newPassword, setNewPassword] = useState('');

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const me = await api('/api/admin/me');
        if (mounted) setIsAdmin(!!me?.user?.isAdmin);
      } catch {
        if (mounted) setIsAdmin(false);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [api]);

  async function loadUsers(reset = true) {
    try {
      setBusyList(true);
      const url = new URL('/api/admin/users', window.location.origin);
      if (q) url.searchParams.set('q', q);
      if (!reset && nextCursor) url.searchParams.set('cursor', nextCursor);
      url.searchParams.set('limit', '25');

      const data = await api(url.toString());
      if (reset) {
        setUsers(data.users || []);
      } else {
        setUsers(prev => [...prev, ...(data.users || [])]);
      }
      setNextCursor(data.nextCursor || null);
    } catch (e) {
      setMsg(e.message || 'Failed to load users');
    } finally {
      setBusyList(false);
    }
  }

  function updatePw(id, val) {
    setPwMap(prev => ({ ...prev, [id]: val }));
  }

  async function setPasswordFor(id) {
    try {
      const pass = pwMap[id] || '';
      await api(`/api/admin/users/${id}/password`, {
        method: 'PUT',
        body: JSON.stringify({ newPassword: pass }),
      });
      setMsg('Password updated.');
      updatePw(id, '');
    } catch (e) {
      setMsg(e.message || 'Failed to set password');
    }
  }

  async function quickResetByUsername() {
    try {
      await api('/api/admin/reset-username', {
        method: 'POST',
        body: JSON.stringify({ username: targetUser.trim(), newPassword }),
      });
      setMsg(`Password updated for ${targetUser.trim()}`);
      setTargetUser('');
      setNewPassword('');
    } catch (e) {
      setMsg(e.message || 'Failed to reset password');
    }
  }

  if (loading) return <div style={{ padding: 16 }}>Loading…</div>;
  if (!user || !isAdmin) return <div style={{ padding: 16 }}>Admin access required.</div>;

  return (
    <div style={{ padding: 16, maxWidth: 900 }}>
      <h2 style={{ marginBottom: 12 }}>Admin Panel</h2>

      {/* Quick reset by username */}
      <div style={{ padding: 12, border: '1px solid var(--color-border,#444)', borderRadius: 8, marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>Quick Reset by Username</h3>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            placeholder="username"
            value={targetUser}
            onChange={e => setTargetUser(e.target.value)}
          />
          <input
            type="password"
            placeholder="new password (min 8)"
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
          />
          <button
            onClick={quickResetByUsername}
            disabled={!targetUser.trim() || (newPassword?.length || 0) < 8}
          >
            Reset
          </button>
        </div>
      </div>

      {/* User search + list */}
      <div style={{ padding: 12, border: '1px solid var(--color-border,#444)', borderRadius: 8 }}>
        <h3 style={{ marginTop: 0 }}>Users</h3>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
          <input
            placeholder="search username"
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') loadUsers(true); }}
            style={{ flex: 1 }}
          />
          <button onClick={() => loadUsers(true)} disabled={busyList}>
            {busyList ? 'Loading…' : 'Search'}
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 1.4fr 120px', gap: 8, alignItems: 'center' }}>
          <div style={{ fontWeight: 600 }}>Username</div>
          <div style={{ fontWeight: 600 }}>Admin</div>
          <div style={{ fontWeight: 600 }}>New Password</div>
          <div style={{ fontWeight: 600 }}>Action</div>

          {users.map(u => (
            <React.Fragment key={u._id}>
              <div>{u.username}</div>
              <div>{u.isAdmin ? 'Yes' : 'No'}</div>
              <div>
                <input
                  type="password"
                  value={pwMap[u._id] || ''}
                  onChange={e => updatePw(u._id, e.target.value)}
                  placeholder="min 8 chars"
                  style={{ width: '100%' }}
                />
              </div>
              <div>
                <button
                  onClick={() => setPasswordFor(u._id)}
                  disabled={!pwMap[u._id] || pwMap[u._id].length < 8}
                >
                  Set Password
                </button>
              </div>
            </React.Fragment>
          ))}
        </div>

        {nextCursor && (
          <div style={{ marginTop: 12 }}>
            <button onClick={() => loadUsers(false)} disabled={busyList}>
              {busyList ? 'Loading…' : 'Load more'}
            </button>
          </div>
        )}
      </div>

      {msg && <p style={{ marginTop: 12 }}>{msg}</p>}
    </div>
  );
}
