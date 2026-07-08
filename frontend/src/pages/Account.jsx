import React, { useEffect, useState } from 'react';
import axios from '../api/axiosInstance';

function useCooldown(initial = 0) {
  const [cooldown, setCooldown] = useState(initial);
  useEffect(() => {
    if (!cooldown) return;
    const t = setInterval(() => setCooldown(c => (c > 0 ? c - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);
  return [cooldown, setCooldown];
}

export default function Account() {
  const [profile, setProfile] = useState(null);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [cooldown, setCooldown] = useCooldown(0);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [msg, setMsg] = useState('');
  const [uploading, setUploading] = useState(false);
  const [confirmingRemovePicture, setConfirmingRemovePicture] = useState(false);

  async function load() {
    try {
      const { data } = await axios.get('/api/me');
      setProfile(data.user);
      setEmail(data.user.pendingEmail || data.user.email || '');
    } catch (e) {
      setMsg(e?.response?.data?.error || e.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function startVerify() {
    setMsg('');
    setSending(true);
    try {
      const { data } = await axios.post('/api/email/start-verify', { email: email.trim() });
      if (data?.dev?.code) {
        setMsg(`Verification code (dev): ${data.dev.code}`);
      } else {
        setMsg('Verification code sent. Check your inbox.');
      }
      setCooldown(60);
      await load();
    } catch (e) {
      setMsg(e?.response?.data?.error || e.message);
    } finally {
      setSending(false);
    }
  }

  async function confirmEmailCode() {
    setMsg('');
    setVerifying(true);
    try {
      await axios.post('/api/email/verify', { code: code.trim() });
      setMsg('Email verified and saved.');
      setCode('');
      await load();
    } catch (e) {
      setMsg(e?.response?.data?.error || e.message);
    } finally {
      setVerifying(false);
    }
  }

  async function handleProfilePictureUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setConfirmingRemovePicture(false);

    // Check file type
    if (!file.type.startsWith('image/')) {
      setMsg('Please select an image file.');
      return;
    }

    // Check file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setMsg('Image must be smaller than 5MB.');
      return;
    }

    setMsg('');
    setUploading(true);
    try {
      // Upload image
      const formData = new FormData();
      formData.append('profilePicture', file);

      const uploadRes = await axios.post('/api/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      // Update user profile with the uploaded image URL
      await axios.patch('/api/me', {
        profilePicture: uploadRes.data.url,
      });

      setMsg('Profile picture updated successfully!');
      await load();
    } catch (e) {
      setMsg(e?.response?.data?.error || 'Failed to upload profile picture.');
    } finally {
      setUploading(false);
    }
  }

  async function removeProfilePicture() {
    if (!confirmingRemovePicture) {
      setConfirmingRemovePicture(true);
      return;
    }

    setMsg('');
    try {
      await axios.patch('/api/me', { profilePicture: '' });
      setMsg('Profile picture removed.');
      setConfirmingRemovePicture(false);
      await load();
    } catch (e) {
      setMsg(e?.response?.data?.error || 'Failed to remove profile picture.');
    }
  }

  return (
    <main className="app-main" style={{ padding: 24 }}>
      <section className="section">
        <header className="section-header">
          <h2 className="font-glow">Account</h2>
          <div className="muted">Add an email so you can recover your account via code/link.</div>
        </header>

        {msg && (
          <div style={{ marginTop: 10, padding: 10, border: '1px solid var(--color-border)', borderRadius: 8 }}>
            {msg}
          </div>
        )}

        <div className="panel" style={{ marginTop: 12 }}>
          <div className="row">
            <div className="muted">Username</div>
            <div>{profile?.username || '—'}</div>
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <div className="muted">Current email</div>
            <div>{profile?.email || '—'}</div>
            {profile?.email && (
              <div className="muted" style={{ marginLeft: 8 }}>
                {profile?.emailVerified ? '✔ verified' : 'unverified'}
              </div>
            )}
          </div>

          {profile?.pendingEmail && (
            <div className="row" style={{ marginTop: 8 }}>
              <div className="muted">Pending email</div>
              <div>{profile.pendingEmail}</div>
            </div>
          )}
        </div>

        <div className="panel" style={{ marginTop: 16 }}>
          <h3 className="font-thread">Profile Picture</h3>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginTop: 12 }}>
            {profile?.profilePicture ? (
              <img
                src={profile.profilePicture}
                alt="Profile"
                style={{
                  width: 80,
                  height: 80,
                  borderRadius: '50%',
                  objectFit: 'cover',
                  border: '2px solid var(--border-primary)',
                }}
              />
            ) : (
              <div
                style={{
                  width: 80,
                  height: 80,
                  borderRadius: '50%',
                  background: 'var(--bg-secondary)',
                  border: '2px solid var(--border-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '2rem',
                  color: 'var(--text-secondary)',
                }}
              >
                {profile?.username?.[0]?.toUpperCase() || '?'}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={{ position: 'relative' }}>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleProfilePictureUpload}
                  disabled={uploading}
                  style={{ display: 'none' }}
                />
                <button
                  className="btn"
                  onClick={(e) => {
                    e.preventDefault();
                    e.currentTarget.previousElementSibling.click();
                  }}
                  disabled={uploading}
                >
                  {uploading ? 'Uploading...' : profile?.profilePicture ? 'Change Picture' : 'Upload Picture'}
                </button>
              </label>

              {profile?.profilePicture && (
                <button
                  className="btn"
                  onClick={removeProfilePicture}
                  disabled={uploading}
                  style={{ background: 'var(--status-error, #dc2626)', color: 'white' }}
                >
                  {confirmingRemovePicture ? 'Confirm Remove' : 'Remove Picture'}
                </button>
              )}
              {profile?.profilePicture && confirmingRemovePicture && (
                <button
                  type="button"
                  className="btn"
                  onClick={() => setConfirmingRemovePicture(false)}
                  disabled={uploading}
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
          <div style={{ marginTop: 8, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Supported: JPG, PNG, WebP, GIF. Max size: 5MB
          </div>
        </div>

        <div className="panel" style={{ marginTop: 16 }}>
          <h3 className="font-thread">Add / Change email</h3>

          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="auth-input"
              style={{ minWidth: 260 }}
            />
            <button
              className="btn"
              onClick={startVerify}
              disabled={sending || cooldown > 0 || !email.trim()}
              title={cooldown > 0 ? `Resend in ${cooldown}s` : 'Send verification code'}
            >
              {cooldown > 0 ? `Resend (${cooldown}s)` : (sending ? 'Sending…' : 'Send code')}
            </button>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <input
              type="text"
              inputMode="numeric"
              pattern="\\d{6}"
              title="6 digits"
              placeholder="enter 6-digit code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\\D+/g, '').slice(0, 6))}
              className="auth-input"
              style={{ maxWidth: 150 }}
            />
            <button className="btn" onClick={confirmEmailCode} disabled={verifying || code.length !== 6}>
              {verifying ? 'Verifying…' : 'Verify & Save'}
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
