// src/DailyRipples.jsx
import React, { useContext, useEffect, useState } from 'react';
import axios from './api/axiosInstance';
import { AuthContext } from './AuthContext.jsx';
import './Main.css';

export default function DailyRipples({ date }) {
  const { token } = useContext(AuthContext);
  const [ripples, setRipples] = useState([]);
  const [loading, setLoading] = useState(true);

  const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};

  async function fetchRipples() {
    setLoading(true);
    try {
      const { data } = await axios.get(`/api/ripples/${date}`, { headers: authHeaders });
      setRipples(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (date) fetchRipples();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  async function approve(ripple) {
    const { data } = await axios.put(`/api/ripples/${ripple._id}/approve`, {}, { headers: authHeaders });
    // remove from list after approval
    setRipples(prev => prev.filter(r => r._id !== ripple._id));
    // you can also emit an event or callback to refresh tasks if desired
  }

  async function dismiss(ripple) {
    await axios.put(`/api/ripples/${ripple._id}/dismiss`, {}, { headers: authHeaders });
    setRipples(prev => prev.filter(r => r._id !== ripple._id));
  }

  return (
    <div>
      <h3 className="font-thread text-vein">Ripples to Review</h3>
      {loading ? (
        <div className="muted">Loading…</div>
      ) : ripples.length === 0 ? (
        <div className="muted">No pending ripples for this day.</div>
      ) : (
        <ul className="tasks" style={{ listStyle: 'none', padding: 0, margin: '8px 0', display: 'grid', gap: 8 }}>
          {ripples.map(r => (
            <li key={r._id} className="task" style={{ background: 'var(--card, #fff)', borderRadius: 12, padding: '10px 12px', boxShadow: '0 1px 4px rgba(0,0,0,.06)', display: 'grid', gap: 8 }}>
              <div className="title">{r.extractedText || '(no text)'}</div>
              <div className="muted" style={{ fontSize: '0.85rem' }}>{r.originalContext}</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="button chip"
                  onClick={() => approve(r)}
                  title="Turn into a task"
                >
                  Approve → Task
                </button>
                <button
                  className="button chip"
                  onClick={() => dismiss(r)}
                  title="Dismiss this ripple"
                >
                  Dismiss
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
