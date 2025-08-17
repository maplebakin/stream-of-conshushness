import React, { useEffect, useMemo, useState } from 'react';

function useQuery() {
  const p = new URLSearchParams(window.location.search);
  return (key) => p.get(key);
}

function PasswordInput({ value, onChange, disabled }) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <input
        type={show ? 'text' : 'password'}
        placeholder="new password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        minLength={6}
        disabled={disabled}
        className="auth-input"
      />
      <button
        type="button"
        className="small"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? 'Hide password' : 'Show password'}
      >
        {show ? 'Hide' : 'Show'}
      </button>
    </div>
  );
}

export default function ResetPassword() {
  const q = useQuery();
  const tokenFromURL = q('token') || '';
  const [mode, setMode] = useState(tokenFromURL ? 'token' : 'code'); // 'token' | 'code'

  // token path
  const [token] = useState(tokenFromURL);
  const [newPassToken, setNewPassToken] = useState('');
  const [loadingA, setLoadingA] = useState(false);

  // code path
  const [username, setUsername] = useState('');
  const [code, setCode] = useState('');
  const [newPassCode, setNewPassCode] = useState('');
  const [loadingB, setLoadingB] = useState(false);

  const [msg, setMsg] = useState('');
  const [redirectIn, setRedirectIn] = useState(0);

  const codeValid = useMemo(() => /^\d{6}$/.test(code), [code]);
  const passValidA = (newPassToken || '').length >= 6;
  const passValidB = (newPassCode || '').length >= 6;
  const canSubmitA = token && passValidA && !loadingA;
  const canSubmitB = username.trim() && codeValid && passValidB && !loadingB;

  useEffect(() => {
    if (redirectIn <= 0) return;
    const t = setInterval(() => setRedirectIn((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [redirectIn]);

  function onlyDigits(s) {
    return s.replace(/\D+/g, '').slice(0, 6);
  }

  async function submitWithToken(e) {
    e.preventDefault();
    if (!canSubmitA) return;
    setLoadingA(true);
    setMsg('');
    try {
      const res = await fetch('/api/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword: newPassToken }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Reset failed');
      setMsg('Password reset. Redirecting to login…');
      setRedirectIn(5);
      setTimeout(() => (window.location.href = '/login'), 5000);
    } catch (err) {
      setMsg(err.message);
    } finally {
      setLoadingA(false);
    }
  }

  async function submitWithCode(e) {
    e.preventDefault();
    if (!canSubmitB) return;
    setLoadingB(true);
    setMsg('');
    try {
      const res = await fetch('/api/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), code, newPassword: newPassCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Reset failed');
      setMsg('Password reset. Redirecting to login…');
      setRedirectIn(5);
      setTimeout(() => (window.location.href = '/login'), 5000);
    } catch (err) {
      setMsg(err.message);
    } finally {
      setLoadingB(false);
    }
  }

  return (
    <main className="auth-page" style={{ padding: 24 }}>
      <section className="auth-card" aria-labelledby="reset-title">
        <header className="auth-header">
          <h1 id="reset-title" className="font-echo text-plum">Reset Password</h1>
          <p className="auth-subtitle font-glow">
            Use the link from your email <i>or</i> enter the 6-digit code we sent.
          </p>
        </header>

        {/* Mode switch */}
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button
            type="button"
            className={`small ${mode === 'token' ? 'btn-active' : ''}`}
            onClick={() => setMode('token')}
            disabled={!tokenFromURL && mode !== 'code'}
            title={tokenFromURL ? '' : 'Open this page from your email link to use this method'}
          >
            Use link
          </button>
          <button
            type="button"
            className={`small ${mode === 'code' ? 'btn-active' : ''}`}
            onClick={() => setMode('code')}
          >
            Use 6-digit code
          </button>
        </div>

        {msg && (
          <div
            role="alert"
            className="auth-note"
            style={{
              marginTop: 10,
              padding: 12,
              border: '1px solid var(--color-border)',
              background: 'var(--color-panel)',
              borderRadius: 8,
            }}
          >
            {msg} {redirectIn > 0 && <b>({redirectIn})</b>}
          </div>
        )}

        {/* A) Token path */}
        {mode === 'token' && (
          <form onSubmit={submitWithToken} style={{ marginTop: 12 }}>
            {!tokenFromURL && (
              <p className="muted" style={{ marginBottom: 8 }}>
                This method is available when you open the reset page from your email link.
              </p>
            )}

            <PasswordInput value={newPassToken} onChange={setNewPassToken} disabled={loadingA} />
            <div style={{ marginTop: 12 }}>
              <button type="submit" className="auth-button" disabled={!canSubmitA}>
                {loadingA ? 'Resetting…' : 'Reset Password'}
              </button>
              <a href="/forgot" className="auth-link" style={{ marginLeft: 8 }}>
                Didn’t get the email?
              </a>
            </div>
          </form>
        )}

        {/* B) Code path */}
        {mode === 'code' && (
          <form onSubmit={submitWithCode} style={{ marginTop: 12 }}>
            <label className="auth-label">
              Username
              <input
                type="text"
                placeholder="your username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={loadingB}
                required
                className="auth-input"
              />
            </label>

            <label className="auth-label" style={{ marginTop: 8 }}>
              6-digit code
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="\\d{6}"
                  title="6 digits"
                  placeholder="000000"
                  value={code}
                  onChange={(e) => setCode(onlyDigits(e.target.value))}
                  disabled={loadingB}
                  required
                  className="auth-input"
                  style={{ maxWidth: 120 }}
                />
                <button
                  type="button"
                  className="small"
                  onClick={async () => {
                    try {
                      const text = await navigator.clipboard.readText();
                      setCode(onlyDigits(text));
                    } catch {
                      setMsg('Clipboard access blocked. Paste manually.');
                    }
                  }}
                  disabled={loadingB}
                  title="Paste from clipboard"
                >
                  Paste
                </button>
              </div>
            </label>

            <label className="auth-label" style={{ marginTop: 8 }}>
              New password
              <PasswordInput value={newPassCode} onChange={setNewPassCode} disabled={loadingB} />
            </label>

            <div style={{ marginTop: 12 }}>
              <button type="submit" className="auth-button" disabled={!canSubmitB}>
                {loadingB ? 'Resetting…' : 'Reset Password'}
              </button>
              <a href="/forgot" className="auth-link" style={{ marginLeft: 8 }}>
                Need a new code?
              </a>
            </div>
          </form>
        )}

        <div style={{ marginTop: 16 }}>
          <a href="/login" className="auth-link">Back to login</a>
        </div>
      </section>
    </main>
  );
}
