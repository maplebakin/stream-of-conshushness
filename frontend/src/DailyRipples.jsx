// src/DailyRipples.jsx
import React, { useContext, useEffect, useMemo, useState } from 'react';
import axios from './api/axiosInstance';
import { AuthContext } from './AuthContext.jsx';
import './DailyRipples.css';

// Toronto day helpers
function todayISOInToronto(d = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric', month: '2-digit', day: '2-digit'
  });
  const parts = fmt.formatToParts(d);
  const y = parts.find(p => p.type === 'year')?.value;
  const m = parts.find(p => p.type === 'month')?.value;
  const dd = parts.find(p => p.type === 'day')?.value;
  return `${y}-${m}-${dd}`;
}
function pickDateProp(props) {
  return props?.date || props?.dateISO || props?.day || todayISOInToronto();
}
function normalizeRipples(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.data)) return payload.data;
  if (payload && Array.isArray(payload.ripples)) return payload.ripples;
  if (payload && payload.data && Array.isArray(payload.data.ripples)) return payload.data.ripples;
  return [];
}

export default function DailyRipples(props) {
  const { token } = useContext(AuthContext);
  const authHeaders = useMemo(
    () => (token ? { Authorization: `Bearer ${token}` } : {}),
    [token]
  );

  const day = pickDateProp(props);

  const [ripples, setRipples] = useState([]);
  const [clusters, setClusters] = useState([]);
  const [clusterSel, setClusterSel] = useState({}); // { rippleId: 'Home' }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // load clusters (optional assignment)
  useEffect(() => {
    if (!token) return;
    axios.get('/api/clusters', { headers: authHeaders })
      .then(res => setClusters(Array.isArray(res.data) ? res.data : []))
      .catch(() => setClusters([]));
  }, [token, authHeaders]);

  // load ripples; force scan on first load to derive suggestions from entries
  useEffect(() => {
    if (!token) return;
    let ignore = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const res = await axios.get(`/api/ripples/${day}?scan=1`, { headers: authHeaders });
        if (!ignore) setRipples(normalizeRipples(res));
      } catch (e) {
        if (!ignore) {
          console.error('[DailyRipples] load failed', e);
          setError('Failed to load ripples.');
          setRipples([]);
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    })();
    return () => { ignore = true; };
  }, [token, authHeaders, day]);

  async function approve(id) {
    try {
      const cluster = clusterSel[id] || '';
      const body = { assignedClusters: cluster ? [cluster] : [], dueDate: day };
      await axios.put(`/api/ripples/${id}/approve`, body, { headers: authHeaders });
      setRipples(prev => prev.filter(r => (r._id || r.id) !== id));
    } catch (e) {
      console.error('approve ripple error', e);
      alert('Could not approve ripple.');
    }
  }
  async function dismiss(id) {
    try {
      await axios.put(`/api/ripples/${id}/dismiss`, {}, { headers: authHeaders });
      setRipples(prev => prev.filter(r => (r._id || r.id) !== id));
    } catch (e) {
      console.error('dismiss ripple error', e);
      alert('Could not dismiss ripple.');
    }
  }

  return (
    <div className="ripple-box">
      <h3>Ripples for {day}</h3>

      {loading && <div className="ripple-empty">Loading…</div>}
      {!loading && error && <div className="ripple-empty">{error}</div>}
      {!loading && !error && ripples.length === 0 && (
        <div className="ripple-empty">No ripples today. Serene surface.</div>
      )}

      {!loading && !error && ripples.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '0.5rem' }}>
          {ripples.map(r => {
            const id = r._id || r.id;
            const conf = r.confidence != null ? Math.round(Number(r.confidence) * 100) : null;
            return (
              <li key={id} className="ripple-item">
                <div className="ripple-text">
                  {r.extractedText || r.text || '(no text)'}
                </div>

                <div className="ripple-actions">
                  {/* meta pills */}
                  {r.rrule ? <span className="chip">repeat</span> : null}
                  {conf != null ? <span className="chip">conf {conf}%</span> : null}

                  {/* optional cluster selection */}
                  <select
                    className="chip-input"
                    value={clusterSel[id] || ''}
                    onChange={e => setClusterSel(prev => ({ ...prev, [id]: e.target.value }))}
                  >
                    <option value="">Cluster (optional)</option>
                    {clusters.map(c => (
                      <option key={c._id} value={c.name}>{c.name}</option>
                    ))}
                  </select>

                  {/* actions */}
                  <button className="chip chip--active" onClick={() => approve(id)}>Approve</button>
                  <button className="chip" onClick={() => dismiss(id)}>Dismiss</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
