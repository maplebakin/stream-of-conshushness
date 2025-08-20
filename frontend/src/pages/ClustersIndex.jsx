// frontend/src/pages/ClustersIndex.jsx
import { useEffect, useState, useContext } from 'react';
import axios from '../api/axiosInstance';
import { AuthContext } from '../AuthContext.jsx';

export default function ClustersIndex() {
  const { token } = useContext(AuthContext);
  const [clusters, setClusters] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    async function run() {
      setLoading(true);
      try {
        const res = await axios.get('/api/sections'); // using Section model for clusters
        if (!cancel) {
          const list = (Array.isArray(res.data) ? res.data : [])
            .map(s => ({
              key: s.key || s.slug || '',
              label: s.label || s.name || s.key || '',
              emoji: s.icon || s.emoji || '🧩',
              pinned: !!s.pinned,
              order: Number.isFinite(s.order) ? s.order : 0,
            }))
            .filter(s => s.key)
            .sort((a,b) => (a.pinned !== b.pinned) ? (a.pinned ? -1:1) : (a.order - b.order) || a.label.localeCompare(b.label));
          setClusters(list);
        }
      } catch (e) {
        console.warn('ClustersIndex error:', e?.response?.data || e.message);
        if (!cancel) setClusters([]);
      } finally {
        if (!cancel) setLoading(false);
      }
    }
    if (token) run();
    return () => { cancel = true; };
  }, [token]);

  return (
    <div className="page">
      <div className="card">
        <div className="section-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <h2 style={{ margin: 0 }}>Clusters</h2>
        </div>

        {loading ? (
          <div>Loading…</div>
        ) : clusters.length === 0 ? (
          <p className="muted">No clusters yet.</p>
        ) : (
          <ul className="unstyled" style={{ columns: 2, columnGap: 16, maxWidth: 720 }}>
            {clusters.map(c => (
              <li key={c.key} style={{ breakInside: 'avoid', marginBottom: 8 }}>
                <a className="link" href={`/clusters/${encodeURIComponent(c.key)}`}>
                  <span style={{ marginRight: 6 }}>{c.emoji}</span>{c.label}
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
