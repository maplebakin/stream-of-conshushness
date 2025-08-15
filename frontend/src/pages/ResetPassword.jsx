import React, { useState } from 'react';

function useQuery() {
  const params = new URLSearchParams(window.location.search);
  return (key) => params.get(key);
}

export default function ResetPassword() {   // <-- default export
  const q = useQuery();
  const [token] = useState(q('token') || '');
  const [username, setUsername] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [msg, setMsg] = useState('');

  async function submitWithToken(e) {
    e.preventDefault();
    setMsg('');
    try {
      const res = await fetch('/api/auth/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Reset failed');
      localStorage.setItem('token', data.token);
      setMsg('Password reset! You are signed in.');
    } catch (e) {
      setMsg(e.message);
    }
  }

  async function submitWithCode(e) {
    e.preventDefault();
    setMsg('');
    try {
      const res = await fetch('/api/auth/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, code, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Reset failed');
      localStorage.setItem('token', data.token);
      setMsg('Password reset! You are signed in.');
    } catch (e) {
      setMsg(e.message);
    }
  }

  return (
    <div className="auth-card">
      <h2>Reset Password</h2>

      {token ? (
        <form onSubmit={submitWithToken}>
          <p>Resetting via secure link.</p>
          <input
            type="password"
            placeholder="new password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={6}
          />
          <button type="submit">Reset Password</button>
        </form>
      ) : (
        <form onSubmit={submitWithCode}>
          <p>No link? Use your username + 6-digit code.</p>
          <input
            type="text"
            placeholder="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
          <input
            type="text"
            placeholder="6-digit code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
            pattern="\d{6}"
            title="6 digits"
          />
          <input
            type="password"
            placeholder="new password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={6}
          />
          <button type="submit">Reset Password</button>
        </form>
      )}

      {msg && <p style={{ marginTop: 8 }}>{msg}</p>}
    </div>
  );
}
