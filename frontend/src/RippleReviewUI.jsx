import React, { useState, useEffect, useContext } from 'react';
import axios from "./api/axiosInstance";
import { AuthContext } from './AuthContext';

const RippleReviewUI = () => {
  const [ripples, setRipples] = useState([]);
  const [selectedCluster, setSelectedCluster] = useState('');
  const [editingRipple, setEditingRipple] = useState(null);
  const [editText, setEditText] = useState('');
  const [filter, setFilter] = useState('all');
  const { token } = useContext(AuthContext);

  const clusters = [
    { id: 'home', name: 'Home' },
    { id: 'work', name: 'Work' },
    { id: 'personal', name: 'Personal' },
    { id: 'health', name: 'Health' }
  ];

  useEffect(() => {
    axios.get('/api/ripples/pending', {
      headers: { Authorization: `Bearer ${token}` }
    })
    .then(res => setRipples(res.data))
    .catch(err => console.error('Failed to fetch ripples:', err));
  }, [token]);

  const getConfidenceColor = (confidence) => {
    const colors = {
      high: 'bg-green-50 border-green-200',
      medium: 'bg-yellow-50 border-yellow-200',
      low: 'bg-gray-50 border-gray-200'
    };
    return colors[confidence] || 'bg-gray-50 border-gray-200';
  };

  const handleApprove = async (id, cluster) => {
    try {
      await axios.put(`/api/ripples/${id}/approve`, { assignedCluster: cluster }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setRipples(prev => prev.map(r => r._id === id ? { ...r, status: 'approved', assignedCluster: cluster } : r));
    } catch (err) {
      console.error('Error approving ripple:', err);
    }
  };

  const handleDismiss = async (id) => {
    try {
      await axios.put(`/api/ripples/${id}/dismiss`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setRipples(prev => prev.map(r => r._id === id ? { ...r, status: 'dismissed' } : r));
    } catch (err) {
      console.error('Error dismissing ripple:', err);
    }
  };

  const filteredRipples = ripples.filter(r => {
    if (filter === 'all') return true;
    if (filter === 'pending') return r.status === 'pending';
    if (filter === 'approved') return r.status === 'approved';
    if (filter === 'dismissed') return r.status === 'dismissed';
    return r.confidence === filter;
  });

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">🌊 Ripple Review</h1>

      <div className="flex flex-wrap gap-2 mb-4">
        {[ 'all', 'pending', 'approved', 'dismissed', 'high', 'medium', 'low' ].map(type => (
          <button
            key={type}
            onClick={() => setFilter(type)}
            className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
              filter === type ? 'bg-blue-200 text-blue-900' : 'bg-gray-100 text-gray-700'
            }`}
          >
            {type.charAt(0).toUpperCase() + type.slice(1)}
          </button>
        ))}
      </div>

      {filteredRipples.map(r => (
        <div
          key={r._id}
          className={`p-4 rounded-lg border-2 mb-4 ${getConfidenceColor(r.confidence)}`}
        >
          <div className="mb-2 text-gray-800 font-medium">{r.extractedText}</div>
          <div className="text-sm text-gray-600 italic mb-2">"{r.originalContext}"</div>

          {r.status === 'pending' && (
            <div className="flex gap-2 items-center">
              <select
                value={selectedCluster}
                onChange={(e) => setSelectedCluster(e.target.value)}
                className="border px-2 py-1 rounded"
              >
                <option value="">Choose cluster...</option>
                {clusters.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <button
                onClick={() => handleApprove(r._id, selectedCluster)}
                className="bg-green-600 text-white px-3 py-1 rounded"
              >
                ✓ Approve
              </button>
              <button
                onClick={() => handleDismiss(r._id)}
                className="bg-red-100 text-red-700 px-3 py-1 rounded"
              >
                ✕ Dismiss
              </button>
            </div>
          )}

          {r.status === 'approved' && (
            <div className="text-green-700 text-sm mt-2">✓ Approved into {r.assignedCluster || 'task list'}</div>
          )}

          {r.status === 'dismissed' && (
            <div className="text-gray-600 text-sm mt-2">✕ Dismissed</div>
          )}
        </div>
      ))}
    </div>
  );
};

export default RippleReviewUI;
