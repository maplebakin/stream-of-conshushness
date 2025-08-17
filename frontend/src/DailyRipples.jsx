// frontend/src/DailyRipples.jsx
import React, { useContext, useEffect, useState } from 'react';
import axios from './api/axiosInstance';
import { AuthContext } from './AuthContext.jsx';
import { toDisplay, formatRecurrence } from './utils/display.js';

function todayISOInToronto() {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit' });
  const p = fmt.formatToParts(new Date());
  return `${p.find(x=>x.type==='year').value}-${p.find(x=>x.type==='month').value}-${p.find(x=>x.type==='day').value}`;
}

export default function DailyRipples({ date }) {
  const { token } = useContext(AuthContext);
  const [ripples, setRipples] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const d = date || todayISOInToronto();
        const { data } = await axios.get(`/api/ripples/${d}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        if (!cancelled) setRipples(Array.isArray(data) ? data : []);
      } catch (e) {
        console.error('Fetch ripples failed', e);
        if (!cancelled) setRipples([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [date, token]);

  async function act(ripple, action, body = {}) {
    try {
      await axios.put(`/api/ripples/${ripple._id}/${action}`, body, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      setRipples(prev => prev.filter(r => r._id !== ripple._id));
    } catch (e) {
      console.error(`Ripple ${action} failed`, e);
    }
  }

  if (loading) return <div className="muted">Loading…</div>;
  if (!ripples.length) return <div className="muted">No pending ripples for this day.</div>;

  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0', display: 'grid', gap: 8 }}>
      {ripples.map(r => (
        <li key={r._id ?? r.id} style={{ background: 'var(--card-bg)', padding: 12, borderRadius: 12, boxShadow: '0 1px 4px rgba(0,0,0,.06)' }}>
          <div style={{ fontWeight: 600 }}>{toDisplay(r.extractedText)}</div>
          {typeof r.originalContext === 'string' && r.originalContext.trim() && (
            <div className="muted" style={{ fontSize: 12 }}>from: {r.originalContext}</div>
          )}
          {r.recurrence && (
            <div className="muted" style={{ fontSize: 12 }}>
              repeat: {formatRecurrence(r.recurrence)}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button onClick={() => act(r, 'approve', { dueDate: (date || todayISOInToronto()) })}>
  Approve → Task
</button>

            <button onClick={() => act(r, 'dismiss')}>Dismiss</button>
          </div>
        </li>
      ))}
    </ul>
  );
}
