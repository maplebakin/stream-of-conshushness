import React, { useContext, useEffect, useState } from 'react';
import axios from '@/api/axiosInstance';
import { AuthContext } from '@/AuthContext.jsx';

export default function ClusterBacklog({ clusterName, dateISO, onScheduled }) {
  const { token } = useContext(AuthContext);
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [items, setItems] = useState([]);

  async function refreshCount() {
    const { data } = await axios.get(`/api/tasks?view=inbox&cluster=${encodeURIComponent(clusterName)}&countOnly=1`, { headers });
    setCount(data?.count || 0);
  }
  async function loadItems() {
    const { data } = await axios.get(`/api/tasks?view=inbox&cluster=${encodeURIComponent(clusterName)}`, { headers });
    setItems(Array.isArray(data) ? data : []);
  }

  useEffect(() => { refreshCount(); }, [clusterName]);

  async function scheduleTo(day, id) {
    const { data: updated } = await axios.patch(`/api/tasks/${id}`, { dueDate: day }, { headers });
    setItems(prev => prev.filter(t => t._id !== id));
    setCount(c => Math.max(0, c - 1));
    onScheduled?.(updated);
  }

  return (
    <div className="panel">
      <button className="inbox-toggle" onClick={async () => {
        const next = !open; setOpen(next);
        if (next && items.length === 0) await loadItems();
      }}>
        {open ? '▼' : '▶'} {clusterName} Backlog — {count}
      </button>

      {open && (
        <ul className="tasks" style={{ listStyle: 'none', padding: 0, marginTop: 8, display: 'grid', gap: 8 }}>
          {items.length === 0 ? (
            <li className="muted">No undated tasks in this cluster.</li>
          ) : items.map(t => (
            <li key={t._id} className="task" style={{ background: 'var(--card,#fff)', borderRadius: 12, padding: '10px 12px', boxShadow: '0 1px 4px rgba(0,0,0,.06)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ flex: 1 }}>{t.title}</div>
              <input
                type="date"
                defaultValue={dateISO}
                onChange={(e) => scheduleTo(e.target.value, t._id)}
                title="Schedule to a date"
                style={{ fontSize: '0.9rem' }}
              />
              <button className="small" onClick={() => scheduleTo(dateISO, t._id)}>Today</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
