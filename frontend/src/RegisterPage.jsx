// src/RegisterPage.jsx
import React, { useState, useContext } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { AuthContext } from './AuthContext.jsx';

export default function RegisterPage() {
  const { login } = useContext(AuthContext);
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState(''); // optional
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          password,
          email: email.trim() || undefined
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Registration failed');
      login(data.token);
      navigate('/');
    } catch (err) {
      setError(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  const pwdMismatch = confirmPassword && password !== confirmPassword;

  return (
    <main className="auth-page">
      <section className="auth-card" role="dialog" aria-labelledby="reg-title">
        <header style={{ marginBottom: 12 }}>
          <h1 id="reg-title" className="auth-title font-echo">Create Account</h1>
          <p className="auth-hint font-glow">Claim your room in the labyrinth.</p>
        </header>

        {error && (
          <div role="alert" className="auth-error font-glow">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form" noValidate aria-busy={loading || undefined}>
          <div className="field">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              className="input"
              type="text"
              placeholder="e.g., voidwitch"
              value={username}
              onChange={e => setUsername(e.target.value)}
              autoComplete="username"
              required
              disabled={loading}
            />
          </div>

          <div className="field">
            <label htmlFor="email">Email <span className="muted">(optional)</span></label>
            <input
              id="email"
              className="input"
              type="email"
              placeholder="you@somewhere"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoComplete="email"
              disabled={loading}
            />
          </div>

          <div className="row">
            <div className="field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                className="input"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="new-password"
                required
                disabled={loading}
              />
            </div>
            <div className="field">
              <label htmlFor="confirm">Confirm</label>
              <input
                id="confirm"
                className="input"
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                required
                aria-invalid={pwdMismatch || undefined}
                disabled={loading}
              />
            </div>
          </div>

          <div className="auth-actions">
            <div className="left">
              <Link to="/login">Back to login</Link>
            </div>
            <div className="right">
              <button type="submit" className="button" disabled={loading}>
                {loading ? 'Creating…' : 'Create account'}
              </button>
            </div>
          </div>
        </form>
      </section>
    </main>
  );
}
