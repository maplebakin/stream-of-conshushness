import React, { useState } from 'react';

export default function ForgotPassword() {  // <-- default export
  const [identifier, setIdentifier] = useState('');
  const [status, setStatus] = useState({ done: false, msg: '' });
  const [devInfo, setDevInfo] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus({ done: false, msg: '' });
    setDevInfo(null);

    try {
      const res = await fetch('/api/auth/forgot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Request failed');

      setStatus({ done: true, msg: 'If the account exists, a reset link or code has been issued.' });
      if (data.dev) setDevInfo(data.dev);
    } catch (err) {
      setStatus({ done: true, msg: err.message });
    }
  }

  return (
    <div className="auth-card">
      <h2>Forgot Password</h2>
      <p>Enter your <b>username</b> or <b>email</b>.</p>
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="username or email"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          required
        />
        <button type="submit">Get Reset Link / Code</button>
      </form>

      {status.done && <p style={{ marginTop: 8 }}>{status.msg}</p>}

      {devInfo && (
        <div style={{ marginTop: 12, padding: 8, border: '1px dashed var(--color-border)' }}>
          <div><b>DEV ONLY</b> (not shown in production):</div>
          <div>username: {devInfo.username}</div>
          <div>link: <a href={devInfo.resetLink}>{devInfo.resetLink}</a></div>
          <div>code: <code>{devInfo.resetCode}</code></div>
        </div>
      )}
    </div>
  );
}
