import React, { useState, useEffect, useContext } from 'react';
import axios              from './api/axiosInstance';
import { AuthContext }    from './AuthContext.jsx';
import './RippleReviewUI.css';  // optional – style as you like

/* TODO: replace with real cluster list pulled from API */
const clusters = [
  { id: 'home',     name: 'Home' },
  { id: 'work',     name: 'Work' },
  { id: 'personal', name: 'Personal' },
  { id: 'health',   name: 'Health' }
];

/* map float confidence → band */
const band = (c) => (c >= 0.66 ? 'high' : c >= 0.33 ? 'medium' : 'low');

const colorClass = {
  high   : 'bg-green-50 border-green-200',
  medium : 'bg-yellow-50 border-yellow-200',
  low    : 'bg-gray-50 border-gray-200'
};

export default function RippleReviewUI() {
  const { token }      = useContext(AuthContext);
  const [ripples, setRipples] = useState([]);
  const [filter,  setFilter]  = useState('pending');      // default view
  const [clusterSel, setClusterSel] = useState({});       // { rippleId: 'Home' }
  const [loading, setLoading] = useState(true);

  /* fetch all pending on mount */
  useEffect(() => {
    if (!token) return;
    setLoading(true);
    axios
      .get('/api/ripples/pending', {
        headers: { Authorization: `Bearer ${token}` }
      })
      .then(res => setRipples(res.data || []))
      .catch(err => console.error('Failed to fetch ripples:', err))
      .finally(() => setLoading(false));
  }, [token]);

  /* approve / dismiss actions */
  const act = async (id, action, cluster) => {
    try {
      await axios.put(
        `/api/ripples/${id}/${action}`,
        action === 'approve' ? { assignedCluster: cluster } : {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setRipples(prev => prev.filter(r => r._id !== id));   // optimistic prune
    } catch (err) {
      console.error(`Error ${action}ing ripple:`, err);
    }
  };

  /* filtering */
  const visible = ripples.filter(r => {
    if (filter === 'all')       return true;
    if (['pending','approved','dismissed'].includes(filter)) return r.status === filter;
    if (['high','medium','low'].includes(filter))            return band(r.confidence) === filter;
    return true;
  });

  /* ui */
  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">🌊 Ripple Review</h1>

      {/* filter chips */}
      <div className="flex flex-wrap gap-2 mb-4">
        {['all','pending','approved','dismissed','high','medium','low'].map(t => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
              filter === t ? 'bg-blue-200 text-blue-900' : 'bg-gray-100 text-gray-700'
            }`}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* list */}
      {loading && <div className="text-center text-gray-400">Loading ripples…</div>}
      {!loading && visible.length === 0 && (
        <div className="text-center text-gray-400">
          <div style={{ fontSize: 48, opacity: 0.2 }}>🌊</div>
          <p>No ripples to review!</p>
        </div>
      )}

      {visible.map(r => (
        <div
          key={r._id}
          className={`p-4 rounded-lg border-2 mb-4 ${colorClass[band(r.confidence)]}`}
        >
          <div className="mb-2 text-gray-800 font-medium">{r.extractedText}</div>
          <div className="text-sm text-gray-600 italic mb-2">“{r.originalContext}”</div>

          {r.status === 'pending' ? (
            <div className="flex flex-wrap gap-2 items-center">
              <select
                value={clusterSel[r._id] || ''}
                onChange={e => setClusterSel(prev => ({ ...prev, [r._id]: e.target.value }))}
                className="border rounded px-2 py-1"
              >
                <option value="">Select Cluster</option>
                {clusters.map(c => (
                  <option key={c.id} value={c.name}>{c.name}</option>
                ))}
              </select>

              <button
                onClick={() => act(r._id, 'approve', clusterSel[r._id])}
                disabled={!clusterSel[r._id]}
                className="px-3 py-1 rounded bg-green-100 hover:bg-green-200 text-green-900 text-sm font-medium disabled:opacity-40"
              >
                Approve
              </button>
              <button
                onClick={() => act(r._id, 'dismiss')}
                className="px-3 py-1 rounded bg-red-100 hover:bg-red-200 text-red-900 text-sm font-medium"
              >
                Dismiss
              </button>
            </div>
          ) : (
            <div className="text-sm mt-2 text-gray-500">
              Status: <span className="font-semibold">{r.status}</span>
              {r.assignedCluster && <> — Cluster: <span className="font-semibold">{r.assignedCluster}</span></>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
