import React, { useState, useEffect, useContext, useMemo } from 'react';
import axios from './api/axiosInstance';
import { AuthContext } from './AuthContext.jsx';
import { toDisplay, formatRecurrence } from './utils/display.js';
import './RippleReviewUI.css'; // optional

/* TODO: replace with real cluster list pulled from API */
const CLUSTERS = [
  { id: 'home',     name: 'Home' },
  { id: 'work',     name: 'Work' },
  { id: 'personal', name: 'Personal' },
  { id: 'health',   name: 'Health' }
];

const band = (c) => (Number(c) >= 0.66 ? 'high' : Number(c) >= 0.33 ? 'medium' : 'low');

const colorClass = {
  high: 'bg-green-50 border-green-200',
  medium: 'bg-yellow-50 border-yellow-200',
  low: 'bg-gray-50 border-gray-200'
};

function todayISOInToronto() {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric', month: '2-digit', day: '2-digit'
  });
  const p = fmt.formatToParts(new Date());
  return `${p.find(x=>x.type==='year').value}-${p.find(x=>x.type==='month').value}-${p.find(x=>x.type==='day').value}`;
}

/**
 * RippleReviewUI
 * Props:
 *   - date?: ISO string; defaults to today (America/Toronto)
 *   - header?: string
 */
export default function RippleReviewUI({ date, header = '🌊 Ripple Review' }) {
  const { token } = useContext(AuthContext);
  const authHeaders = useMemo(
    () => (token ? { Authorization: `Bearer ${token}` } : {}),
    [token]
  );

  const dayISO = useMemo(() => date || todayISOInToronto(), [date]);

  const [ripples, setRipples] = useState([]);
  const [filter, setFilter] = useState('pending');
  const [clusterSel, setClusterSel] = useState({}); // { rippleId: 'Home' }
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  // fetch pending for the specified day
  useEffect(() => {
    if (!token) return;
    setLoading(true);
    setErr('');
    axios
      .get(`/api/ripples/${dayISO}`, { headers: authHeaders })
      .then(res => setRipples(Array.isArray(res.data) ? res.data : []))
      .catch(e => {
        console.error('Failed to fetch ripples:', e);
        setErr('Failed to load ripples');
        setRipples([]);
      })
      .finally(() => setLoading(false));
  }, [token, authHeaders, dayISO]);

  // approve / dismiss
async function act(id, action, clusterName) {
  try {
    const body = action === 'approve'
      ? {
          assignedClusters: clusterName ? [clusterName] : [],
          dueDate: /* default to the panel date if no field present */ (drafts[id]?.dueDate || dayISO)
        }
      : {};
    await axios.put(`/api/ripples/${id}/${action}`, body, { headers: authHeaders });
    setRipples(prev => prev.filter(r => r._id !== id));
  } catch (e) {
    console.error(`Error ${action}ing ripple:`, e);
    alert(`Could not ${action} ripple. Check console.`);
  }
}


  // filter list
  const visible = useMemo(() => {
    return ripples.filter(r => {
      if (filter === 'all') return true;
      if (['pending','approved','dismissed'].includes(filter)) return r.status === filter;
      if (['high','medium','low'].includes(filter)) return band(r.confidence) === filter;
      return true;
    });
  }, [ripples, filter]);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-baseline justify-between mb-4">
        <h1 className="text-2xl font-bold">{header}</h1>
        <span className="text-sm text-gray-500">{dayISO}</span>
      </div>

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

      {loading && <div className="text-center text-gray-400">Loading ripples…</div>}
      {!loading && err && <div className="text-center text-red-400">{err}</div>}
      {!loading && !err && visible.length === 0 && (
        <div className="text-center text-gray-400">
          <div style={{ fontSize: 48, opacity: 0.2 }}>🌊</div>
          <p>No ripples to review!</p>
        </div>
      )}

      {visible.map(r => {
        const b = band(r.confidence);
        const cluster = clusterSel[r._id] || '';
        return (
          <div
            key={r._id ?? r.id}
            className={`p-4 rounded-lg border-2 mb-4 ${colorClass[b]}`}
          >
            <div className="mb-2 text-gray-800 font-medium">{toDisplay(r.extractedText)}</div>

            {r.originalContext && typeof r.originalContext === 'string' && (
              <div className="text-sm text-gray-600 italic mb-2">“{r.originalContext}”</div>
            )}

            {r.recurrence && (
              <div className="mb-2">
                <span className="inline-block text-xs px-2 py-1 rounded-full bg-gray-200 text-gray-800">
                  repeat: {formatRecurrence(r.recurrence)}
                </span>
              </div>
            )}

            {r.status === 'pending' ? (
              <div className="flex flex-wrap gap-2 items-center">
                <select
                  value={cluster}
                  onChange={e => setClusterSel(prev => ({ ...prev, [r._id]: e.target.value }))}
                  className="border rounded px-2 py-1"
                >
                  <option value="">Select Cluster</option>
                  {CLUSTERS.map(c => (
                    <option key={c.id} value={c.name}>{c.name}</option>
                  ))}
                </select>

                <button
                  onClick={() => act(r._id, 'approve', cluster)}
                  disabled={!cluster}
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
                Status: <span className="font-semibold">{toDisplay(r.status)}</span>
                {r.assignedCluster && <> — Cluster: <span className="font-semibold">{toDisplay(r.assignedCluster)}</span></>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
