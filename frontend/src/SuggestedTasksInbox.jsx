import React, { useEffect, useState, useContext } from 'react';
import axios           from './api/axiosInstance';
import { AuthContext } from './AuthContext.jsx';

export default function SuggestedTasksInbox() {
  const { token } = useContext(AuthContext);
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchList = () => {
    axios.get('/api/suggested-tasks', { headers:{ Authorization:`Bearer ${token}` } })
         .then(r => setList(r.data)).finally(() => setLoading(false));
  };

  useEffect(fetchList, [token]);

  const act = (id, action) => {
    axios.put(`/api/suggested-tasks/${id}/${action}`, {}, { headers:{ Authorization:`Bearer ${token}` } })
         .then(fetchList);
  };

  if (loading) return <p className="p-4 text-gray-400">Loading suggestions…</p>;
  if (!list.length) return <p className="p-4 text-gray-400">No suggested tasks 🎉</p>;

  return (
    <div className="p-4 space-y-3">
      {list.map(t => (
        <div key={t._id} className="border p-3 rounded flex items-center justify-between">
          <span>{t.title}</span>
          <div className="space-x-2">
            <button className="approve-btn" onClick={() => act(t._id,'accept')}>Accept</button>
            <button className="dismiss-btn" onClick={() => act(t._id,'reject')}>Reject</button>
          </div>
        </div>
      ))}
    </div>
  );
}
