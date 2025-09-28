import React, { useContext, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from '../api/axiosInstance';
import { AuthContext } from '../AuthContext.jsx';
import CreateClusterModal from '../components/CreateClusterModal.jsx';
import { normalizeClusterList } from '../utils/clusterHelpers.js';
import '../Main.css';
import './Clusters.css';

export default function ClustersIndex() {
  const { token } = useContext(AuthContext);
  const headers = useMemo(() => (token ? { Authorization: `Bearer ${token}` } : {}), [token]);
  const navigate = useNavigate();

  const [clusters, setClusters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  async function load() {
    setLoading(true); setErr('');
    try {
      const r = await axios.get('/api/clusters', { headers });
      const list = normalizeClusterList(r);
      const sorted = [...list].sort((a, b) => a.name.localeCompare(b.name));
      setClusters(sorted);
    } catch (e) {
      setErr(e?.response?.data?.error || e.message || 'Failed to load clusters.');
      setClusters([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (token) load(); }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  function onCreated(newCluster) {
    setShowCreate(false);
    const slug = newCluster?.slug || '';
    if (slug) navigate(`/clusters/${encodeURIComponent(slug)}`);
    else load();
  }

  return (
    <div className="page clusters-page">
      <header className="page-header clusters-toolbar">
        <div>
          <h1 className="page-title">Clusters</h1>
          <p className="page-subtitle">Browse and jump into any cluster you&apos;ve created.</p>
        </div>
        <div className="clusters-toolbar__actions">
          <button type="button" className="pill" onClick={load} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
          <button type="button" className="button" onClick={() => setShowCreate(true)}>
            + New cluster
          </button>
        </div>
      </header>

      {err && (
        <div className="alert error" role="alert">
          {err}
        </div>
      )}

      <section className="card clusters-panel" aria-live="polite">
        {loading ? (
          <div className="loading">Loading clusters…</div>
        ) : !clusters.length ? (
          <div className="clusters-empty">No clusters yet. Create one to begin.</div>
        ) : (
          <div className="clusters-grid" role="list">
            {clusters.map((c) => {
              const stamp = c.updatedAt || c.createdAt;
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
                  <span className="cluster-card__meta">
                    Updated {stamp ? new Date(stamp).toLocaleString() : 'just now'}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {showCreate && (
        <CreateClusterModal onClose={() => setShowCreate(false)} onCreated={onCreated} />
      )}
    </div>
  );
}
