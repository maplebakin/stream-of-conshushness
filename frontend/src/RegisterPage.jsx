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
      return setError('Passwords do not match.');
    }
    setLoading(true);
    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, email: email.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Registration failed');
      login(data.token);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page" style={{ padding: 24 }}>
      <h2 className="font-glow">Create Account</h2>
      <form onSubmit={handleSubmit} style={{ marginTop: 12 }}>
        <input
          type="text" placeholder="username" value={username}
          onChange={(e) => setUsername(e.target.value)} required
        />
        <input
          type="email" placeholder="email (optional)" value={email}
          onChange={(e) => setEmail(e.target.value)} style={{ marginTop: 8 }}
        />
        <input
          type="password" placeholder="password" value={password}
          onChange={(e) => setPassword(e.target.value)} required style={{ marginTop: 8 }}
        />
        <input
          type="password" placeholder="confirm password" value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)} required style={{ marginTop: 8 }}
        />
        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
          <button type="submit" disabled={loading}>{loading ? 'Creating…' : 'Create'}</button>
          <Link to="/login" className="auth-link">Back to login</Link>
        </div>
      </form>
      {error && <p style={{ color: 'var(--color-danger)', marginTop: 8 }}>{error}</p>}
    </div>
  );
}
