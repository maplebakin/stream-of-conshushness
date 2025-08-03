import React, { useEffect, useState, useContext } from 'react';
import axios from './api/axiosInstance';
import { AuthContext } from './AuthContext';

export default function DailyRipples({ date }) {
  const [ripples, setRipples] = useState([]);
  const [clusterSelections, setClusterSelections] = useState({});
  const { token } = useContext(AuthContext);

  useEffect(() => {
    if (!date || !token) return;
    axios.get(`/api/ripples/pending`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    .then(res => {
      const filtered = res.data.filter(r => r.entryDate === date);
      setRipples(filtered);
    })
    .catch(err => console.error('Error fetching ripples:', err));
  }, [token, date]);

  const handleClusterChange = (rippleId, value) => {
    setClusterSelections(prev => ({ ...prev, [rippleId]: value }));
  };

  const handleApprove = async (id) => {
    const selectedCluster = clusterSelections[id] || '';
    try {
      await axios.put(`/api/ripples/${id}/approve`, {
        assignedCluster: selectedCluster
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setRipples(prev => prev.filter(r => r._id !== id));
    } catch (err) {
      console.error('Error approving ripple:', err);
    }
  };

  const handleDismiss = async (id) => {
    try {
      await axios.put(`/api/ripples/${id}/dismiss`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setRipples(prev => prev.filter(r => r._id !== id));
    } catch (err) {
      console.error('Error dismissing ripple:', err);
    }
  };

  if (ripples.length === 0) return null;

  return (
    <div className="bg-white rounded shadow p-4 mb-4">
      <h2 className="text-lg font-semibold mb-2">🌊 Ripples for {date}</h2>
      {ripples.map(r => (
        <div key={r._id} className="mb-3 p-3 border rounded bg-blue-50">
          <div className="font-medium text-blue-900 mb-1">{r.extractedText}</div>
          <div className="text-sm text-gray-600 italic mb-2">"{r.originalContext}"</div>
          <div className="flex gap-2 items-center">
            <select
              value={clusterSelections[r._id] || ''}
              onChange={e => handleClusterChange(r._id, e.target.value)}
              className="border px-2 py-1 rounded text-sm"
            >
              <option value="">Cluster?</option>
              <option value="home">Home</option>
              <option value="work">Work</option>
              <option value="personal">Personal</option>
              <option value="health">Health</option>
            </select>
            <button
              onClick={() => handleApprove(r._id)}
              className="bg-green-600 text-white text-sm px-3 py-1 rounded"
            >
              ✓ Approve
            </button>
            <button
              onClick={() => handleDismiss(r._id)}
              className="bg-red-100 text-red-700 text-sm px-3 py-1 rounded"
            >
              ✕ Dismiss
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
