// src/Login.jsx
import React, { useState, useContext, useRef, useEffect } from 'react';
import { AuthContext } from './AuthContext.jsx';
import { useNavigate, Link } from 'react-router-dom';
import axios from './api/axiosInstance';
import './login.css';

export default function LoginPage() {
  const { login } = useContext(AuthContext);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const usernameRef = useRef(null);

  useEffect(() => {
    usernameRef.current?.focus();
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!username.trim() || !password) {
      setError('Enter your username or email and password.');
      return;
    }
    setLoading(true);
    try {
      const { data } = await axios.post('/api/login', {
        identifier: username.trim(),
        password,
      });
      login(data);
      navigate('/');
    } catch (err) {
      setError(err?.response?.data?.error || err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card" role="dialog" aria-labelledby="auth-title">
        <header className="auth-header" style={{ marginBottom: 12 }}>
          <h1 id="auth-title" className="auth-title font-echo">StreamofConshushness</h1>
          <p className="auth-hint font-glow">Welcome back, traveler. Sign in to continue your thread.</p>
        </header>

        {error && (
          <div role="alert" className="auth-error font-glow">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form" noValidate aria-busy={loading || undefined}>
          <div className="field">
            <label htmlFor="username">Username or email</label>
            <input
              id="username"
              className="input"
              type="text"
              placeholder="Username or email"
              ref={usernameRef}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={loading}
              autoComplete="username"
              required
            />
          </div>

          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              className="input"
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              autoComplete="current-password"
              required
            />
          </div>

          <div className="auth-actions">
            <div className="left" />
            <div className="right">
              <button type="submit" className="button" disabled={loading || !username.trim() || !password}>
                {loading ? 'Logging in…' : 'Log In'}
              </button>
            </div>
          </div>
        </form>

        <div className="auth-divider"><span className="muted">or</span></div>

        <footer className="auth-footer">
          <span className="font-glow">Don’t have an account?</span>
          <Link to="/register">Register here</Link>
          <span style={{ marginLeft: 'auto' }}>
            <Link to="/forgot">Forgot your password?</Link>
          </span>
        </footer>
      </section>
    </main>
  );
}
