import React, { useContext, useEffect, useMemo, useState } from 'react';
import axios from '../api/axiosInstance';
import { AuthContext } from '../AuthContext.jsx';

// ——— Toronto helpers ———
function todayISOInToronto(d = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year:'numeric', month:'2-digit', day:'2-digit' });
  const parts = Object.fromEntries(fmt.formatToParts(d).map(p => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
const pickDateProp = (p) => p?.date || p?.dateISO || p?.day || todayISOInToronto();
const pickClusterProp = (p) => p?.cluster || p?.clusterKey || '';
const pickDefaultStatus = (p) => (p?.pendingOnly === false ? 'all' : 'pending');

function normalizeRipples(payload) {
  const p = payload?.data ?? payload;
  const arr =
    Array.isArray(p) ? p :
    Array.isArray(p?.ripples) ? p.ripples :
    Array.isArray(p?.data) ? p.data :
    Array.isArray(p?.data?.ripples) ? p.data.ripples :
    [];
  // normalize fields so UI is stable
  return arr.map(r => ({
    _id: r._id || r.id,
    dateKey: r.dateKey || r.entryDate || r.date || '',
    text: r.extractedText || r.text || r.title || '',
    section: r.section || r.cluster || '',
    status: r.status || 'pending',
    score: typeof r.score === 'number' ? r.score : (r.confidence != null ? Math.round(Number(r.confidence) * 100) : null),
    meta: r.meta || {},
    createdAt: r.createdAt, updatedAt: r.updatedAt, source: r.source || r.reason || ''
  })).filter(r => r._id);
}

export default function DailyRipples(props) {
  const { token } = useContext(AuthContext);
  const [ripples, setRipples] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [pendingOnly, setPendingOnly] = useState(pickDefaultStatus(props) !== 'all');
  const [busy, setBusy] = useState({}); // { [id]: 'approve'|'dismiss' }

  const day = pickDateProp(props);
  const cluster = pickClusterProp(props);
  const headers = useMemo(() => (token ? { Authorization: `Bearer ${token}` } : {}), [token]);

  async function load() {
    setLoading(true); setErr('');
    try {
      const params = { date: day };
      if (cluster) params.cluster = cluster;
      const res = await axios.get('/api/ripples', { headers, params });
      setRipples(normalizeRipples(res));
    } catch (e) {
      console.error('[DailyRipples] load failed', e?.response?.data || e);
      setErr('Failed to load ripples.');
      setRipples([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [token, day, cluster]);

  // actions
  async function act(id, which) {
    try {
      setBusy(b => ({ ...b, [id]: which }));
      const url = which === 'approve'
        ? `/api/ripples/${encodeURIComponent(id)}/approve`
        : `/api/ripples/${encodeURIComponent(id)}/dismiss`;
      await axios.post(url, null, { headers });
      setRipples(prev => prev.map(r => r._id === id ? { ...r, status: which === 'approve' ? 'approved' : 'dismissed' } : r));
    } catch (e) {
      console.warn(`[DailyRipples] ${which} failed`, e?.response?.data || e);
    } finally {
      setBusy(b => {
        const n = { ...b }; delete n[id]; return n;
      });
    }
  }

  const visible = useMemo(() => (
    pendingOnly ? ripples.filter(r => r.status === 'pending') : ripples
  ), [ripples, pendingOnly]);

  return (
    <div className="daily-ripples">
      <div className="head">
        <h3>Ripples for {day}{cluster ? ` • ${cluster}` : ''}</h3>
        <div className="controls">
          <button className={`pill ${pendingOnly ? '' : 'pill-muted'}`} onClick={() => setPendingOnly(p => !p)}>
            {pendingOnly ? 'Pending only' : 'All'}
          </button>
          <button className="pill" onClick={load} aria-label="Refresh">Refresh</button>
        </div>
      </div>

      {loading && <div className="loading" aria-live="polite">Loading…</div>}
      {!loading && err && <div className="error" role="alert">{err}</div>}
      {!loading && !err && visible.length === 0 && (
        <div className="empty">No ripples {pendingOnly ? 'pending ' : ''}today. Serene surface.</div>
      )}

      {!loading && !err && visible.length > 0 && (
        <ul className="ripple-list">
          {visible.map(r => (
            <li key={r._id} className={`ripple ${r.status}`}>
              <div className="ripple-row">
                <span className="ripple-type">{r.source || r.type || 'analyze'}</span>
                <span className={`status ${r.status}`}>{r.status}</span>
              </div>
              <div className="ripple-text">{r.text || '(no text)'}</div>
              <div className="ripple-meta">
                {r.meta?.dueDate && <span className="pill">due {r.meta.dueDate}</span>}
                {r.meta?.recurrenceLabel && <span className="pill">{r.meta.recurrenceLabel}</span>}
                {r.score != null && <span className="pill">score {r.score}</span>}
                {r.section && <span className="pill">§ {r.section}</span>}
              </div>
              {r.status === 'pending' && (
                <div className="actions">
                  <button className="btn sm" disabled={!!busy[r._id]} onClick={() => act(r._id, 'approve')}>
                    {busy[r._id] === 'approve' ? 'Approving…' : 'Approve'}
                  </button>
                  <button className="btn ghost sm" disabled={!!busy[r._id]} onClick={() => act(r._id, 'dismiss')}>
                    {busy[r._id] === 'dismiss' ? 'Dismissing…' : 'Dismiss'}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <style>{`
        .daily-ripples .head { display:flex; align-items:center; justify-content:space-between; gap:.5rem; margin-bottom:.5rem; }
        .daily-ripples .head h3 { margin:0; font-size:1rem; }
        .controls { display:flex; gap:.4rem; }
        .loading, .empty, .error { padding:.5rem .75rem; font-size:.95rem; }
        .error { color:#ff9191; }
        .ripple-list { list-style:none; padding:0; margin:0; display:grid; gap:.5rem; }
        .ripple {
          display:grid; gap:.35rem;
          padding:.6rem .7rem; border-radius:10px;
          border:1px solid var(--color-border, #2a2a32);
          background: rgba(255,255,255,.02);
        }
        .ripple-row { display:flex; justify-content:space-between; align-items:center; gap:.5rem; }
        .ripple-type { font-size:.8rem; color:var(--color-muted, #9aa0aa); text-transform: lowercase; }
        .status { font-size:.75rem; padding:.05rem .4rem; border-radius:999px; border:1px solid var(--color-border,#2a2a32); color:var(--color-muted,#9aa0aa); }
        .status.pending { }
        .status.approved { color:#8fe3a2; }
        .status.dismissed { color:#ff9191; }
        .ripple-text { font-weight:600; }
        .ripple-meta { display:flex; gap:.35rem; flex-wrap:wrap; }
        .pill { display:inline-block; font-size:.75rem; padding:.05rem .4rem; border:1px solid var(--color-border,#2a2a32); border-radius:999px; color:var(--color-muted,#9aa0aa); }
        .actions { display:flex; gap:.5rem; margin-top:.25rem; }
        .btn { border:1px solid var(--color-border,#2a2a32); background:transparent; color:inherit; padding:.25rem .5rem; border-radius:8px; cursor:pointer; }
        .btn.ghost { opacity:.8; }
        .btn.sm { font-size:.85rem; }
        .pill.pill-muted, .pill-muted { opacity:.6; }
      `}</style>
    </div>
  );
}
