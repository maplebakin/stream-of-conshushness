import React, { useContext, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from '../api/axiosInstance';
import { AuthContext } from '../AuthContext.jsx';
import { normalizeClusterList, slugifyCluster } from '../utils/clusterHelpers.js';
import '../Main.css';
import './Clusters.css';

export default function Clusters() {
  const { token } = useContext(AuthContext);
  const headers = useMemo(() => (token ? { Authorization: `Bearer ${token}` } : {}), [token]);
  const [clusters, setClusters] = useState([]);
  const [name, setName] = useState('');
  const [color, setColor] = useState('#9ecae1');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  async function load() {
    setErr('');
    try {
      const r = await axios.get('/api/clusters', { headers });
      const list = normalizeClusterList(r);
      const sorted = [...list].sort((a, b) => a.name.localeCompare(b.name));
      setClusters(sorted);
    } catch (e) {
      setErr(e?.response?.data?.error || e.message || 'Failed to load clusters.');
      setClusters([]);
    }
  }

  useEffect(() => { if (token) load(); }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  async function create(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true); setErr('');
    try {
      await axios.post('/api/clusters', { name: name.trim(), slug: slugifyCluster(name), color }, { headers });
      setName(''); setColor('#9ecae1');
      await load();
    } catch (e2) {
      setErr(e2?.response?.data?.error || e2.message || 'Create failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page clusters-page">
      <header className="page-header clusters-toolbar">
        <div>
          <h1 className="page-title">Clusters</h1>
          <p className="page-subtitle">Group goals, tasks, and notes by focus area.</p>
        </div>
        <div className="clusters-toolbar__actions">
          <button type="button" className="pill" onClick={load} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </header>

      <section className="card clusters-panel" aria-labelledby="cluster-create-heading">
        <div className="stack">
          <div>
            <h2 id="cluster-create-heading" className="card-title">Create a cluster</h2>
            <p className="card-meta">Name your cluster and choose a color to quickly spot it across the workspace.</p>
          </div>
          <form className="clusters-form" onSubmit={create}>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="New cluster name"
              aria-label="Cluster name"
              required
            />
            <input
              type="color"
              value={color}
              aria-label="Cluster color"
              onChange={(e) => setColor(e.target.value)}
            />
            <button type="submit" className="button" disabled={loading}>
              {loading ? 'Adding…' : 'Add cluster'}
            </button>
          </form>
        </div>

        {err && (
          <div className="alert error" role="alert">
            {err}
          </div>
        )}

        {!clusters.length ? (
          <div className="clusters-empty">No clusters yet. Create your first one above.</div>
        ) : (
          <div className="clusters-grid" role="list">
            {clusters.map((c) => {
              const stamp = c.updatedAt || c.createdAt;
              const stampLabel = stamp ? new Date(stamp).toLocaleString() : 'just now';
              const icon = c.icon || '🗂️';
              return (
                <Link
                  key={c.id || c.slug}
                  to={`/clusters/${encodeURIComponent(c.slug)}`}
                  className="cluster-card"
                  style={{ '--cluster-color': c.color || 'var(--color-spool)' }}
                  role="listitem"
                >
                  <div className="cluster-card__head">
                    <span className="cluster-card__icon" aria-hidden="true">{icon}</span>
                    <div className="stack">
                      <span className="text-strong">{c.name}</span>
                      <span className="cluster-card__meta">#{c.slug}</span>
                    </div>
                  </div>
                  <span className="cluster-card__meta">Updated {stampLabel}</span>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
