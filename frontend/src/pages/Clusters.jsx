import React, { useContext, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from '../api/axiosInstance';
import { AuthContext } from '../AuthContext.jsx';

function slugifyKey(s = '') {
  return String(s).toLowerCase().trim().replace(/[^\p{Letter}\p{Number}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 64);
}
function normalizeClusters(resOrData) {
  const d = resOrData?.data ?? resOrData;
  if (Array.isArray(d)) return d;
  if (Array.isArray(d?.data)) return d.data;          // backend: { data: [...] }
  if (Array.isArray(d?.clusters)) return d.clusters;  // legacy
  if (Array.isArray(d?.data?.clusters)) return d.data.clusters;
  return [];
}

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
    }
  }

  useEffect(() => { if (token) load(); }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  async function create(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true); setErr('');
    try {
      await axios.post('/api/clusters', { key: slugifyKey(name), label: name, color }, { headers });
      setName(''); setColor('#9ecae1');
      await load();
    } catch (e2) {
      setErr(e2?.response?.data?.error || e2.message || 'Create failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page" style={{ padding: 16 }}>
      <div style={{ display:'flex', alignItems:'baseline', justifyContent:'space-between', gap:12 }}>
        <h2 style={{ margin:0 }}>Clusters</h2>
        <button className="pill" onClick={load}>Refresh</button>
      </div>

      <form onSubmit={create} style={{ display:'flex', gap:8, margin:'12px 0' }}>
        <input value={name} onChange={e=>setName(e.target.value)} placeholder="New cluster name" required />
        <input type="color" value={color} onChange={e=>setColor(e.target.value)} />
        <button disabled={loading}>{loading ? 'Adding…' : 'Add'}</button>
      </form>

      {err && <div style={{ color:'crimson', marginBottom:8 }}>{err}</div>}

      {!clusters.length ? (
        <div className="card">No clusters yet. Create your first one above.</div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(240px,1fr))', gap:12 }}>
          {clusters.map(c => (
            <Link
              key={c._id || c.key}
              to={`/clusters/${encodeURIComponent(c.key)}`}
              className="card"
              style={{ textDecoration:'none', color:'inherit', boxShadow:'0 1px 4px rgba(0,0,0,.08)' }}
            >
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <div style={{ width:14, height:14, borderRadius:999, background:c.color }} />
                <strong>{c.icon ? `${c.icon} ` : ''}{c.label}</strong>
              </div>
              <small className="muted">updated {new Date(c.updatedAt).toLocaleString()}</small>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
