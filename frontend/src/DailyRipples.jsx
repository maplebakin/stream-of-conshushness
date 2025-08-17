// frontend/src/components/DailyRipples.jsx
import React, { useContext, useEffect, useMemo, useState } from 'react';
import { AuthContext } from './AuthContext.jsx';
import { makeApi } from './utils/api.js';

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
  // Accept: date, dateISO, day
  return props?.date || props?.dateISO || props?.day || todayISOInToronto();
}

function pickClusterProp(props) {
  // Accept: cluster, clusterKey
  return props?.cluster || props?.clusterKey || '';
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
  const api = useMemo(() => makeApi(token), [token]);

  const [ripples, setRipples] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const day = pickDateProp(props);
  const cluster = pickClusterProp(props);

  useEffect(() => {
    let ignore = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const qs = cluster ? `?cluster=${encodeURIComponent(cluster)}` : '';
        const res = await api.get(`/api/ripples/${day}${qs}`);
        if (ignore) return;
        setRipples(normalizeRipples(res));
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
  }, [api, day, cluster]);

  return (
    <div className="daily-ripples">
      <div className="head">
        <h3>Ripples for {day}{cluster ? ` • ${cluster}` : ''}</h3>
      </div>

      {loading && <div className="loading" aria-live="polite">Loading…</div>}
      {!loading && error && <div className="error" role="alert">{error}</div>}
      {!loading && !error && ripples.length === 0 && (
        <div className="empty">No ripples today. Serene surface.</div>
      )}

      {!loading && !error && ripples.length > 0 && (
        <ul className="ripple-list">
          {ripples.map(r => (
            <li key={r._id || r.id || `${r.entryDate}-${(r.extractedText||'').slice(0,20)}`} className="ripple">
              <div className="ripple-type">{r.type || r.reason || 'suggestedTask'}</div>
              <div className="ripple-text">{r.extractedText || r.text || '(no text)'}</div>
              <div className="ripple-meta">
                {r.meta?.dueDate ? <span className="pill">due {r.meta.dueDate}</span> : null}
                {r.meta?.recurrenceLabel ? <span className="pill">{r.meta.recurrenceLabel}</span> : null}
                {r.confidence != null ? <span className="pill">conf {(r.confidence*100|0)}%</span> : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      <style>{`
        .daily-ripples .head h3 { margin: 0 0 .5rem 0; font-size: 1rem; }
        .loading, .empty, .error { padding: .5rem .75rem; font-size: .95rem; }
        .error { color: #ff9191; }
        .ripple-list { list-style: none; padding: 0; margin: 0; display: grid; gap: .5rem; }
        .ripple {
          display: grid; gap: .25rem;
          padding: .5rem .6rem; border-radius: 10px;
          border: 1px solid var(--color-border, #2a2a32);
          background: rgba(255,255,255,.02);
        }
        .ripple-type { font-size: .8rem; color: var(--color-muted, #9aa0aa); }
        .ripple-text { font-weight: 600; }
        .ripple-meta { display: flex; gap: .35rem; flex-wrap: wrap; margin-top: .15rem; }
        .pill {
          display: inline-block; font-size: .75rem;
          padding: .05rem .4rem; border: 1px solid var(--color-border, #2a2a32);
          border-radius: 999px; color: var(--color-muted, #9aa0aa);
        }
      `}</style>
    </div>
  );
}
