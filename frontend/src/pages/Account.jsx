import React, { useContext, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from '../api/axiosInstance';
import PrivateUploadImage from '../components/PrivateUploadImage';
import { AuthContext } from '../AuthContext.jsx';
import { CompactPageHeader } from '../components/UXPrimitives.jsx';
import './Account.css';

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
  const { logout } = useContext(AuthContext);
  const [profile, setProfile] = useState(null);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [cooldown, setCooldown] = useCooldown(0);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [msg, setMsg] = useState('');
  const [uploading, setUploading] = useState(false);
  const [confirmingRemovePicture, setConfirmingRemovePicture] = useState(false);
  const [verificationStarted, setVerificationStarted] = useState(false);
  const pictureInputRef = useRef(null);

  async function load() {
    try {
      const { data } = await axios.get('/api/me');
      setProfile(data.user);
      setEmail(data.user.pendingEmail || data.user.email || '');
      setVerificationStarted(Boolean(data.user.pendingEmail));
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
      setVerificationStarted(true);
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
    <main className="page account-page">
      <CompactPageHeader
        eyebrow="Your space"
        title="Account"
        description="Keep your profile recognizable and make sure you can get back in."
      />

      {msg && <div className="alert" role="status">{msg}</div>}

      <section className="card account-section" aria-labelledby="account-profile-title">
        <div>
          <p className="account-section__eyebrow">Profile</p>
          <h2 id="account-profile-title">{profile?.username || 'Your profile'}</h2>
        </div>
        <div className="account-profile">
          <div className="account-profile__avatar">
            {profile?.profilePicture ? (
              <PrivateUploadImage
                url={profile.profilePicture}
                alt={`${profile?.username || 'Your'} profile`}
                className="account-profile__image"
                fallback={<span>{profile?.username?.[0]?.toUpperCase() || '?'}</span>}
              />
            ) : (
              <span>{profile?.username?.[0]?.toUpperCase() || '?'}</span>
            )}
          </div>
          <div className="account-profile__actions">
            <input
              ref={pictureInputRef}
              type="file"
              accept="image/*"
              onChange={handleProfilePictureUpload}
              disabled={uploading}
              className="visually-hidden"
              tabIndex={-1}
            />
            <button
              type="button"
              className="button"
              onClick={() => pictureInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? 'Uploading…' : profile?.profilePicture ? 'Change picture' : 'Add a picture'}
            </button>
            {profile?.profilePicture && (
              <>
                <button
                  type="button"
                  className="button quiet"
                  onClick={removeProfilePicture}
                  disabled={uploading}
                >
                  {confirmingRemovePicture ? 'Confirm removal' : 'Remove picture'}
                </button>
                {confirmingRemovePicture && (
                  <button
                    type="button"
                    className="button quiet"
                    onClick={() => setConfirmingRemovePicture(false)}
                    disabled={uploading}
                  >
                    Cancel
                  </button>
                )}
              </>
            )}
            <small>JPG, PNG, WebP, or GIF · up to 5 MB</small>
          </div>
        </div>
      </section>

      <section className="card account-section" aria-labelledby="account-recovery-title">
        <div>
          <p className="account-section__eyebrow">Account recovery</p>
          <h2 id="account-recovery-title">Recovery email</h2>
          <p className="muted">
            {profile?.email
              ? `${profile.email}${profile.emailVerified ? ' · Verified' : ' · Not verified yet'}`
              : 'No recovery email added.'}
          </p>
        </div>

        <div className="account-form-row">
          <label>
            <span>Email address</span>
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="button"
            onClick={startVerify}
            disabled={sending || cooldown > 0 || !email.trim()}
          >
            {cooldown > 0 ? `Resend in ${cooldown}s` : sending ? 'Sending…' : profile?.email ? 'Change recovery email' : 'Add recovery email'}
          </button>
        </div>

        {verificationStarted && (
          <div className="account-verification" aria-label="Verify recovery email">
            <p>Enter the six-digit code sent to {profile?.pendingEmail || email}.</p>
            <div className="account-form-row">
              <label>
                <span>Verification code</span>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="\\d{6}"
                  autoComplete="one-time-code"
                  placeholder="123456"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\\D+/g, '').slice(0, 6))}
                />
              </label>
              <button type="button" className="button" onClick={confirmEmailCode} disabled={verifying || code.length !== 6}>
                {verifying ? 'Verifying…' : 'Verify email'}
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="card account-section" aria-labelledby="account-security-title">
        <div>
          <p className="account-section__eyebrow">Security</p>
          <h2 id="account-security-title">Session and password</h2>
          <p className="muted">Password changes and other preferences live in Settings.</p>
        </div>
        <div className="account-security-actions">
          <Link className="button secondary" to="/settings">Open settings</Link>
          <button type="button" className="button danger" onClick={logout}>Sign out</button>
        </div>
      </section>
    </main>
  );
}
