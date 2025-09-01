import React, { useContext, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from '../api/axiosInstance';
import { AuthContext } from '../AuthContext.jsx';
import CreateClusterModal from '../components/CreateClusterModal.jsx';

function slugifyKey(s = '') {
  return String(s).toLowerCase().trim().replace(/[^\p{Letter}\p{Number}]+/gu,'-').replace(/^-+|-+$/g,'').slice(0,64);
}
function normalizeClusters(resOrData) {
  const d = resOrData?.data ?? resOrData;
  if (Array.isArray(d)) return d;
  if (Array.isArray(d?.data)) return d.data;
  if (Array.isArray(d?.clusters)) return d.clusters;
  if (Array.isArray(d?.data?.clusters)) return d.data.clusters;
  return [];
}

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
      const list = normalizeClusters(r);
      const normalized = list.map(c => ({
        _id: c._id,
        key: (c.key || c.slug || slugifyKey(c.label || c.name || '')).toLowerCase(),
        label: c.label || c.name || c.key || 'Untitled',
        color: c.color || '#9b87f5',
        icon: c.icon || '🗂️',
        pinned: !!c.pinned,
        order: Number.isFinite(c.order) ? c.order : 0,
        updatedAt: c.updatedAt || c.createdAt || new Date().toISOString()
      })).filter(c => c.key);

      normalized.sort((a, b) =>
        (a.pinned !== b.pinned) ? (a.pinned ? -1 : 1)
        : (a.order - b.order) || a.label.localeCompare(b.label)
      );
      setClusters(normalized);
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
    const key = (newCluster?.key || slugifyKey(newCluster?.label || newCluster?.name || '')).toLowerCase();
    if (key) navigate(`/clusters/${encodeURIComponent(key)}`);
    else load();
  }

  return (
    <div className="page">
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="section-header" style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <h2 style={{ margin: 0 }}>Clusters</h2>
          <div style={{ display:'flex', gap:8 }}>
            <button className="pill" onClick={load} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</button>
            <button className="pill" onClick={() => setShowCreate(true)}>+ New</button>
          </div>
        </div>

        {err && <div style={{ color: 'crimson', marginTop: 8 }}>{err}</div>}

        {loading ? (
          <div>Loading…</div>
        ) : !clusters.length ? (
          <p className="muted">No clusters yet. Create one to begin.</p>
        ) : (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(240px,1fr))', gap:12 }}>
            {clusters.map(c => (
              <Link
                key={c._id || c.key}
                to={`/clusters/${encodeURIComponent(c.key)}`}
                className="card"
                style={{ textDecoration:'none', color:'inherit', borderColor: c.color }}
              >
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <span style={{ fontSize: 22 }}>{c.icon}</span>
                  <div style={{ display:'grid' }}>
                    <div style={{ fontWeight: 700 }}>{c.label}</div>
                    <div className="muted" style={{ fontSize: 12 }}>#{c.key}</div>
                  </div>
                </div>
                <small className="muted" style={{ marginTop: 6 }}>
                  updated {new Date(c.updatedAt).toLocaleString()}
                </small>
              </Link>
            ))}
          </div>
        )}
      </div>

      {showCreate && (
        <CreateClusterModal onClose={() => setShowCreate(false)} onCreated={onCreated} />
      )}
    </div>
  );
}
