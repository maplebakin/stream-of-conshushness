import React, { useContext, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from '../api/axiosInstance';
import { AuthContext } from '../AuthContext.jsx';
import { normalizeClusterList, slugifyCluster } from '../utils/clusterHelpers.js';

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
          {clusters.map(c => {
            const stamp = c.updatedAt || c.createdAt;
            return (
              <Link
                key={c.id || c.slug}
                to={`/clusters/${encodeURIComponent(c.slug)}`}
                className="card"
                style={{ textDecoration:'none', color:'inherit', boxShadow:'0 1px 4px rgba(0,0,0,.08)' }}
              >
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <div style={{ width:14, height:14, borderRadius:999, background:c.color }} />
                  <strong>{c.icon ? `${c.icon} ` : ''}{c.name}</strong>
                </div>
                <small className="muted">updated {stamp ? new Date(stamp).toLocaleString() : 'just now'}</small>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
