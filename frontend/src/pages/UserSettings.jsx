// src/pages/UserSettings.jsx
import React, { useEffect, useState } from 'react';
import axios from '../api/axiosInstance';
import '../Settings.css';

export default function UserSettings() {

  // profile state
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [currentEmail, setCurrentEmail] = useState('');
  const [pendingEmail, setPendingEmail] = useState('');
  const [emailVerified, setEmailVerified] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [verifyingEmail, setVerifyingEmail] = useState(false);

  // password state
  const [oldPassword, setOld] = useState('');
  const [newPassword, setNew] = useState('');
  const [pwMsg, setPwMsg] = useState('');
  const [pwBusy, setPwBusy] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data: { user } } = await axios.get('/api/me');
        if (!mounted) return;
        setUsername(user?.username || '');
        setCurrentEmail(user?.email || '');
        setPendingEmail(user?.pendingEmail || '');
        setEmailVerified(!!user?.emailVerified);
        setEmail(user?.pendingEmail || user?.email || '');
      } catch (e) {
        setMsg(e.message);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  async function saveProfile(e) {
    e?.preventDefault?.();
    setMsg('');
    if (!username.trim()) {
      setMsg('Username is required.');
      return;
    }
    setSaving(true);
    try {
      const nextEmail = email.trim();
      const { data: { user } } = await axios.patch('/api/me', { username: username.trim() });
      setUsername(user.username);
      setCurrentEmail(user.email || '');
      setEmailVerified(!!user.emailVerified);

      if (nextEmail && (nextEmail !== (user.email || '') || !user.emailVerified)) {
        const { data } = await axios.post('/api/email/start-verify', { email: nextEmail });
        setPendingEmail(nextEmail);
        setMsg(data?.dev?.code
          ? `Profile updated. Verification code (dev): ${data.dev.code}`
          : 'Profile updated. Check your inbox for a verification code.');
      } else {
        setPendingEmail(user.pendingEmail || '');
        setMsg('Profile updated.');
      }
    } catch (e) {
      setMsg(e?.response?.data?.error || e.message);
    } finally {
      setSaving(false);
    }
  }

  async function confirmEmail() {
    setMsg('');
    setVerifyingEmail(true);
    try {
      const { data: { user } } = await axios.post('/api/email/verify', {
        code: verificationCode.trim(),
      });
      setCurrentEmail(user.email || '');
      setEmail(user.email || '');
      setPendingEmail('');
      setEmailVerified(!!user.emailVerified);
      setVerificationCode('');
      setMsg('Email verified and saved.');
    } catch (e) {
      setMsg(e?.response?.data?.error || e.message);
    } finally {
      setVerifyingEmail(false);
    }
  }

  async function changePassword(e) {
    e?.preventDefault?.();
    setPwMsg('');
    if (!oldPassword || newPassword.length < 6) {
      setPwMsg('Enter your current password and a new password of at least 6 characters.');
      return;
    }
    setPwBusy(true);
    try {
      await axios.post('/api/change-password', { oldPassword, newPassword });
      setOld(''); setNew('');
      setPwMsg('Password updated.');
    } catch (e) {
      setPwMsg(e?.response?.data?.error || e.message);
    } finally {
      setPwBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="settings-wrap">
        <div className="settings-header">
          <h2 className="font-echo text-2xl text-vein">Settings</h2>
          <p className="text-muted">Loading your profile…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="settings-wrap">
      <div className="settings-header">
        <h2 className="font-echo text-2xl text-vein sm:text-3xl">User Settings</h2>
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
              <span className="field-label">Email (verification required)</span>
              <input
                className="input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@domain.com"
                autoComplete="email"
              />
              <span className="field-label">
                Current: {currentEmail || 'none'}
                {currentEmail ? (emailVerified ? ' (verified)' : ' (unverified)') : ''}
              </span>
            </label>

            {pendingEmail && (
              <label className="field">
                <span className="field-label">
                  Verification code for {pendingEmail}
                </span>
                <input
                  className="input"
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value)}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="6-digit code"
                />
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={verifyingEmail || !verificationCode.trim()}
                  onClick={confirmEmail}
                >
                  {verifyingEmail ? 'Verifying…' : 'Verify email'}
                </button>
              </label>
            )}

            <div className="button-row">
              <button type="submit" className="btn btn-primary" disabled={saving || !username.trim()}>
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
              <button
                type="submit"
                className="btn btn-primary"
                disabled={pwBusy || !oldPassword || newPassword.length < 6}
              >
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
