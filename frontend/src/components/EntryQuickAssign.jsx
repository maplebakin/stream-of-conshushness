import React, { useEffect, useState, useContext } from 'react';
import axios from '../api/axiosInstance';
import { AuthContext } from '../AuthContext.jsx';

export default function EntryQuickAssign({ entry, onUpdated, onTaskCreated }) {
  const { token } = useContext(AuthContext);
  const [clusters, setClusters] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let ignore = false;
    axios.get('/api/clusters', {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => { if (!ignore) setClusters(res.data || []); })
      .catch(() => { if (!ignore) setClusters([]); });
    return () => { ignore = true; };
  }, [token]);

  async function setCluster(newCluster) {
    setLoading(true);
    try {
      const res = await axios.patch(`/api/entries/${entry._id}`, { cluster: newCluster }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      onUpdated && onUpdated(res.data);
    } catch (e) {
      console.error('setCluster failed', e);
      alert('Could not set cluster');
    } finally {
      setLoading(false);
    }
  }

  async function makeTask() {
    setLoading(true);
    try {
      await axios.post('/api/tasks/from-entry', { entryId: entry._id }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      onTaskCreated && onTaskCreated();
    } catch (e) {
      console.error('makeTask failed', e);
      alert('Could not create task');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="qa-row">
      <span className="qa-label">
        {entry.cluster ? `Cluster: ${entry.cluster}` : 'Unassigned'}
      </span>

      <select
        className="qa-select"
        disabled={loading}
        value={entry.cluster || ''}
        onChange={(e) => setCluster(e.target.value)}
        aria-label="Set cluster"
      >
        <option value="">— set cluster —</option>
        {clusters.map(c => (
          <option key={c._id} value={c.slug || c.name.toLowerCase()}>{c.name}</option>
        ))}
      </select>

      <button
        className="qa-btn"
        disabled={loading}
        onClick={makeTask}
        title="Create a task from this entry"
      >
        Make task
      </button>
    </div>
  );
}
