// frontend/src/SuggestedTasksInbox.jsx
import React, { useEffect, useState, useContext, useMemo } from 'react';
import axios from './api/axiosInstance';
import { AuthContext } from './AuthContext.jsx';

function todayISOInToronto() {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric', month: '2-digit', day: '2-digit'
  });
  const p = fmt.formatToParts(new Date());
  return `${p.find(x=>x.type==='year').value}-${p.find(x=>x.type==='month').value}-${p.find(x=>x.type==='day').value}`;
}

/**
 * SuggestedTasksInbox
 * Note: backend route `/api/suggested-tasks` is optional; this UI
 * degrades gracefully if the route isn’t mounted yet.
 */
export default function SuggestedTasksInbox({ dateISO, onAccepted, onRejected }) {
  const { token } = useContext(AuthContext);
  const auth = useMemo(() => (token ? { Authorization: `Bearer ${token}` } : {}), [token]);
  const dayISO = useMemo(() => dateISO || todayISOInToronto(), [dateISO]);

  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState({});
  const [err, setErr] = useState('');

  const fetchList = async () => {
    if (!token) return;
    setLoading(true);
    setErr('');
    try {
      const r = await axios.get('/api/suggested-tasks', { headers: auth });
      setList(Array.isArray(r.data) ? r.data : []);
    } catch (e) {
      console.error('Failed to fetch suggestions:', e);
      setErr('Failed to load suggestions');
      setList([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchList();   }, [token]);

  const act = async (id, action) => {
    if (!token) return;
    setBusy(prev => ({ ...prev, [id]: true }));
    try {
      const body = action === 'accept' ? { dueDate: dayISO } : {};
      const r = await axios.put(`/api/suggested-tasks/${id}/${action}`, body, { headers: auth });
      setList(prev => prev.filter(t => t._id !== id));
      if (action === 'accept' && typeof onAccepted === 'function') onAccepted(r.data?.task || r.data);
      if (action === 'reject' && typeof onRejected === 'function') onRejected({ _id: id });
    } catch (e) {
      console.error(`Error ${action}ing suggested task:`, e);
      alert(`Could not ${action} this item. Check console for details.`);
    } finally {
      setBusy(prev => ({ ...prev, [id]: false }));
    }
  };

  if (!token) return <p className="p-4 text-gray-400">Sign in to see suggestions.</p>;
  if (loading) return <p className="p-4 text-gray-400">Loading suggestions…</p>;
  if (err) return <p className="p-4 text-gray-400">No suggested tasks right now.</p>;
  if (!list.length) return <p className="p-4 text-gray-400">No suggested tasks 🎉</p>;

  return (
    <div className="space-y-3 p-4">
      {list.map(t => (
        <div key={t._id} className="flex items-center justify-between rounded border p-3">
          <div className="flex-1 pr-3">
            <div className="font-medium">{t.title || t.extractedText || '(untitled)'}</div>
            {t.originalContext && (
              <div className="mt-1 text-xs italic text-gray-500">from: {t.originalContext}</div>
            )}
          </div>
          <div className="space-x-2">
            <button
              className="approve-btn rounded bg-green-100 px-3 py-1 text-sm font-medium text-green-900 hover:bg-green-200 disabled:opacity-50"
              onClick={() => act(t._id, 'accept')}
              disabled={!!busy[t._id]}
              title={`Accept to ${dayISO}`}
            >
              Accept → {dayISO}
            </button>
            <button
              className="dismiss-btn rounded bg-red-100 px-3 py-1 text-sm font-medium text-red-900 hover:bg-red-200 disabled:opacity-50"
              onClick={() => act(t._id, 'reject')}
              disabled={!!busy[t._id]}
            >
              Reject
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
