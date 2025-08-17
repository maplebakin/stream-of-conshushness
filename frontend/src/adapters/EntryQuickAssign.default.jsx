// frontend/src/adapters/EntryQuickAssign.default.jsx
import React, { useContext, useState } from 'react';
import axios from '../api/axiosInstance';
import { AuthContext } from '../AuthContext.jsx';
import ClusterPicker from '../components/ClusterPicker.jsx';

export default function EntryQuickAssign({ entry, onUpdated, onTaskCreated }) {
  const { token } = useContext(AuthContext);
  const [saving, setSaving] = useState(false);

  async function setCluster(key) {
    if (!entry?._id) return;
    setSaving(true);
    try {
      const res = await axios.put(
        `/api/entries/${entry._id}`,
        { cluster: key },
        { headers: token ? { Authorization: `Bearer ${token}` } : {} }
      );

      // Handle either {data: entry} or entry directly
      const updated = res?.data?.data || res?.data || { ...entry, cluster: key };
      onUpdated && onUpdated(updated);
    } catch (e) {
      console.error('cluster update failed', e);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="qa-wrap">
      <ClusterPicker
        value={entry?.cluster || ''}
        disabled={saving}
        onChange={setCluster}
      />
    </div>
  );
}
