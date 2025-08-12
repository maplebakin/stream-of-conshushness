// src/Login.jsx
import React, { useState, useContext, useRef, useEffect } from 'react';
import { AuthContext } from './AuthContext.jsx';
import { useNavigate, Link } from 'react-router-dom';
import './login.css';

export default function LoginPage() {
  const { login } = useContext(AuthContext);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const usernameRef = useRef();

  useEffect(() => {
    usernameRef.current?.focus();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Login failed');

      login(data.token);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="auth-title">
        <header className="auth-header">
          <h1 id="auth-title" className="font-echo text-plum">Stream of Conshushness</h1>
          <p className="auth-subtitle font-glow">Welcome back, traveler. Sign in to continue your thread.</p>
        </header>

        {error && (
          <div role="alert" className="auth-error font-glow">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form" noValidate>
          <label className="auth-label">
            Username
            <input
              type="text"
              placeholder="Username"
              ref={usernameRef}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={loading}
              autoComplete="username"
              className="auth-input"
              required
            />
          </label>

          <label className="auth-label">
            Password
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              autoComplete="current-password"
              className="auth-input"
              required
            />
          </label>

          <button type="submit" disabled={loading} className="auth-submit">
            {loading ? 'Logging in…' : 'Log In'}
          </button>
        </form>

        <footer className="auth-footer">
          <span className="font-glow">Don't have an account?</span>
          <Link to="/register" className="auth-link">
            Register here
          </Link>
        </footer>
      </section>
    </main>
  );
}
