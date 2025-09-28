// src/TaskModal.jsx
import React, { useContext, useEffect, useMemo, useState } from 'react';
import axios from './api/axiosInstance';
import { AuthContext } from './AuthContext.jsx';
import { normalizeClusterList } from './utils/clusterHelpers.js';

function todayISOInToronto(d = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric', month: '2-digit', day: '2-digit'
  });
  const parts = fmt.formatToParts(d);
  const y = parts.find(p => p.type === 'year')?.value;
  const m = parts.find(p => p.type === 'month')?.value;
  const dd = parts.find(p => p.type === 'day')?.value;
  return `${y}-${m}-${dd}`;
}

/**
 * Props:
 *   - isOpen: boolean
 *   - onClose: () => void
 *   - onSaved: () => void   // called after successful POST so caller can clean up (e.g., dismiss ripple)
 *   - defaultTitle?: string
 *   - defaultDueDate?: 'YYYY-MM-DD'
 *   - defaultCluster?: string
 */
export default function TaskModal({
  isOpen,
  onClose,
  onSaved,
  defaultTitle = '',
  defaultDueDate = todayISOInToronto(),
  defaultCluster = ''
}) {
  const { token } = useContext(AuthContext);
  const headers = useMemo(
    () => (token ? { Authorization: `Bearer ${token}` } : {}),
    [token]
  );

  const [title, setTitle] = useState(defaultTitle);
  const [dueDate, setDueDate] = useState(defaultDueDate || todayISOInToronto());
  const [cluster, setCluster] = useState(defaultCluster || '');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [clusters, setClusters] = useState([]);

  useEffect(() => {
    setTitle(defaultTitle);
    setDueDate(defaultDueDate || todayISOInToronto());
    setCluster(defaultCluster || '');
  }, [defaultTitle, defaultDueDate, defaultCluster]);

  useEffect(() => {
    if (!token) return;
    axios.get('/api/clusters', { headers })
      .then(res => setClusters(normalizeClusterList(res)))
      .catch(() => setClusters([]));
  }, [token, headers]);

  if (!isOpen) return null;

  async function saveTask(e) {
    e?.preventDefault?.();
    if (!title.trim()) {
      setErr('Title is required.');
      return;
    }
    setSaving(true);
    setErr('');
    try {
      // Minimal, schema-safe payload. Adjust keys only if your /api/tasks expects different names.
      const payload = {
        title: title.trim(),
        dueDate: dueDate || todayISOInToronto(),
        cluster: cluster || undefined,
        note: note.trim() || undefined,
        status: 'todo'
      };

      // CREATE TASK — NOT an event
      const res = await axios.post('/api/tasks', payload, {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });

      // Success: let parent dismiss the ripple / refresh lists
      onSaved?.(res.data);
      onClose?.();
    } catch (e) {
      console.error('Create task failed:', e);
      const msg =
        e?.response?.data?.error ||
        e?.response?.data?.message ||
        e?.message ||
        'Failed to create task.';
      setErr(String(msg));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 rounded-xl shadow-2xl w-full max-w-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">New Task</h2>
          <button
            onClick={onClose}
            className="px-2 py-1 rounded text-sm bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700"
          >
            Close
          </button>
        </div>

        <form onSubmit={saveTask} className="space-y-3">
          <div>
            <label className="block text-sm mb-1">Title</label>
            <input
              autoFocus
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g., Clean the fish tank"
              className="w-full border rounded px-3 py-2 bg-white dark:bg-zinc-900"
            />
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-sm mb-1">Due date</label>
              <input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className="w-full border rounded px-3 py-2 bg-white dark:bg-zinc-900"
              />
            </div>

            <div className="flex-1">
              <label className="block text-sm mb-1">Cluster (optional)</label>
              <select
                value={cluster}
                onChange={e => setCluster(e.target.value)}
                className="w-full border rounded px-3 py-2 bg-white dark:bg-zinc-900"
              >
                <option value="">—</option>
                {clusters.map((c) => (
                  <option key={c.id || c.slug} value={c.slug}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm mb-1">Note (optional)</label>
            <textarea
              rows={3}
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder=""
              className="w-full border rounded px-3 py-2 bg-white dark:bg-zinc-900"
            />
          </div>

          {err && <div className="text-red-600 text-sm">{err}</div>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 rounded bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !title.trim()}
              className="px-3 py-2 rounded bg-green-600 hover:bg-green-700 text-white disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Create Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
