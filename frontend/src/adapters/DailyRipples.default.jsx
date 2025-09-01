// /frontend/src/adapters/DailyRipples.default.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { fetchRipplesForDate, approveRipple, dismissRipple } from '../api/ripples.js';
import '../DailyRipples.css';

// Lightweight formatter if you don't want to import your utils
function toISODateLocalToronto(d = new Date()) {
  // Assume system clock is Toronto-ish; good enough for daily grouping
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function DailyRipples({ date, initialRipples }) {
  const [ripples, setRipples] = useState(initialRipples || []);
  const [loading, setLoading] = useState(!initialRipples);
  const [error, setError] = useState('');
  const dateISO = useMemo(() => {
    if (!date) return toISODateLocalToronto();
    if (typeof date === 'string') return date.slice(0, 10);
    return toISODateLocalToronto(date);
  }, [date]);

  useEffect(() => {
    let alive = true;
    async function run() {
      if (initialRipples) return;
      setLoading(true);
      setError('');
      try {
        const data = await fetchRipplesForDate(dateISO);
        if (alive) setRipples(data);
      } catch (e) {
        if (alive) setError(e?.message || 'failed to load ripples');
      } finally {
        if (alive) setLoading(false);
      }
    }
    run();
    return () => { alive = false; };
  }, [dateISO, initialRipples]);

  async function onApprove(r) {
    try {
      await approveRipple(r);
      setRipples((rs) => rs.filter((x) => (x.id || x._id) !== (r.id || r._id)));
    } catch (e) {
      console.error(e);
      setError('approve failed');
    }
  }
  async function onDismiss(r) {
    try {
      await dismissRipple(r);
      setRipples((rs) => rs.filter((x) => (x.id || x._id) !== (r.id || r._id)));
    } catch (e) {
      console.error(e);
      setError('dismiss failed');
    }
  }

  return (
    <div className="ripple-box">
      <div className="ripple-header">
        <h3 className="font-glow text-lg">Ripples for {dateISO}</h3>
      </div>

      {loading && <div className="ripple-empty">summoning ripples…</div>}
      {error && <div className="text-red-600 text-sm mb-2">{error}</div>}

      {!loading && ripples?.length === 0 && (
        <div className="ripple-empty">no ripples found</div>
      )}

      <div className="ripple-list">
        {ripples?.map((r) => (
          <article key={r.id || r._id} className="ripple-item">
            <div className="ripple-text">{r.text || r.content || r.summary || '(no text)'}</div>
            <div className="ripple-meta">
              {r.section ? <span className="chip">{r.section}</span> : null}
              {r.source ? <span className="chip">src: {r.source}</span> : null}
              {(r.score ?? null) !== null ? <span className="chip">score {r.score}</span> : null}
            </div>
            <div className="ripple-actions">
              <button className="btn btn-primary" onClick={() => onApprove(r)}>approve</button>
              <button className="btn" onClick={() => onDismiss(r)}>dismiss</button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
