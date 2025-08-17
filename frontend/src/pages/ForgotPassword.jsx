import React, { useEffect, useMemo, useState } from 'react';

const EMAIL_LINKS = {
  'gmail.com'       : 'https://mail.google.com/',
  'outlook.com'     : 'https://outlook.live.com/mail/',
  'hotmail.com'     : 'https://outlook.live.com/mail/',
  'live.com'        : 'https://outlook.live.com/mail/',
  'yahoo.com'       : 'https://mail.yahoo.com/',
  'icloud.com'      : 'https://www.icloud.com/mail',
  'proton.me'       : 'https://mail.proton.me/',
  'protonmail.com'  : 'https://mail.proton.me/',
};

function useCooldown(initial = 0) {
  const [cooldown, setCooldown] = useState(initial);
  useEffect(() => {
    if (!cooldown) return;
    const t = setInterval(() => setCooldown(c => (c > 0 ? c - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);
  return [cooldown, setCooldown];
}

export default function ForgotPassword() {
  const [identifier, setIdentifier] = useState('');
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useCooldown(0);
  const [status, setStatus] = useState({ ok: false, msg: '' });
  const [devInfo, setDevInfo] = useState(null);

  const domain = useMemo(() => {
    const at = identifier.indexOf('@');
    if (at === -1) return '';
    return identifier.slice(at + 1).toLowerCase().trim();
  }, [identifier]);

  const emailPortal = EMAIL_LINKS[domain];

  async function requestReset() {
    setStatus({ ok: false, msg: '' });
    setDevInfo(null);
    setLoading(true);
    try {
      const res = await fetch('/api/forgot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not start reset');

      setStatus({
        ok: true,
        msg:
          'If an account exists, we’ve sent a reset link to the email on file and issued a 6-digit code.',
      });
      // Helpful in dev; not shown in prod by the server.
      if (data.dev) setDevInfo(data.dev);
      setCooldown(60); // throttle resends
    } catch (err) {
      setStatus({ ok: false, msg: err.message });
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(e) {
    e.preventDefault();
    if (!identifier.trim()) {
      setStatus({ ok: false, msg: 'Please enter your username or email.' });
      return;
    }
    requestReset();
  }

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      setStatus({ ok: true, msg: 'Copied to clipboard.' });
    } catch {
      setStatus({ ok: false, msg: 'Copy failed — you can highlight and copy manually.' });
    }
  }

  return (
    <main className="auth-page" style={{ padding: 24 }}>
      <section className="auth-card" aria-labelledby="forgot-title">
        <header className="auth-header">
          <h1 id="forgot-title" className="font-echo text-plum">Forgot Password</h1>
          <p className="auth-subtitle font-glow">
            Enter your <b>username</b> or <b>email</b>. We’ll send a link and a 6-digit code.
          </p>
        </header>

        {status.msg && (
          <div
            role="alert"
            className="auth-note"
            style={{
              marginTop: 8,
              padding: 12,
              border: '1px solid var(--color-border)',
              background: 'var(--color-panel)',
              borderRadius: 8,
            }}
          >
            {status.msg}
          </div>
        )}

        <form onSubmit={onSubmit} style={{ marginTop: 12 }}>
          <label className="auth-label">
            Username or email
            <input
              type="text"
              placeholder="e.g. mira_ashe or you@example.com"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              disabled={loading}
              autoFocus
              className="auth-input"
              required
            />
          </label>

          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button type="submit" className="auth-button" disabled={loading}>
              {loading ? 'Sending…' : 'Send reset'}
            </button>

            <button
              type="button"
              className="auth-button"
              onClick={requestReset}
              disabled={loading || cooldown > 0}
              title={cooldown > 0 ? `Resend available in ${cooldown}s` : 'Resend reset email/code'}
            >
              {cooldown > 0 ? `Resend (${cooldown}s)` : 'Resend'}
            </button>

            <a href="/reset" className="auth-link" style={{ alignSelf: 'center' }}>
              Have a code already?
            </a>
          </div>
        </form>

        {/* Helpful “open your inbox” shortcut */}
        {emailPortal && (
          <div style={{ marginTop: 12 }}>
            <a className="auth-link" href={emailPortal} target="_blank" rel="noreferrer">
              Open {domain} inbox
            </a>
          </div>
        )}

        {/* DEV helper block (server only includes this in non-prod) */}
        {devInfo && (
          <div
            style={{
              marginTop: 16,
              padding: 12,
              border: '1px dashed var(--color-border)',
              borderRadius: 8,
            }}
          >
            <div><b>DEV HELPER</b></div>
            <div style={{ marginTop: 6 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <code style={{ wordBreak: 'break-all' }}>{devInfo.resetLink}</code>
                <button type="button" className="small" onClick={() => copy(devInfo.resetLink)}>
                  Copy link
                </button>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
                <code>{devInfo.resetCode}</code>
                <button type="button" className="small" onClick={() => copy(devInfo.resetCode)}>
                  Copy code
                </button>
              </div>
              <div style={{ marginTop: 6 }}>
                <a href={devInfo.resetLink}>Open reset page</a>
              </div>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
