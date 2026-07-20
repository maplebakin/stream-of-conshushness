// frontend/src/adapters/EntryQuickAssign.default.jsx
import React, { useContext, useEffect, useMemo, useState } from 'react';
import axios from '../api/axiosInstance';
import { AuthContext } from '../AuthContext.jsx';
import {
  normalizeClusterList,
  primaryClusterReference,
  resolveClusterId,
} from '../utils/clusterHelpers.js';
import { isClustered } from '../utils/isClustered.js';

/**
 * Default EntryQuickAssign:
 * - Set/clear an entry's cluster (PATCH /api/entries/:id)
 * - Create a task from the entry text, due on the entry’s date
 *   and link it to the entry (POST /api/tasks then POST /api/tasks/:id/link-entry)
 *
 * Props:
 *   entry: {_id, text|content, date|dateISO|createdAt, cluster?}
 *   onUpdated(updatedEntry)
 *   onTaskCreated()
 */

// --- helpers ----------------------------------------------------
function isoFromDateLike(val) {
  if (!val) return '';
  const d = new Date(val);
  return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}
function entryDateISO(en) {
  return en?.date || en?.dateISO || isoFromDateLike(en?.createdAt) || '';
}
function stripHtml(html) {
  if (typeof html !== 'string') return '';
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function titleFromEntry(en) {
  const plain = (typeof en?.text === 'string' && en.text) ? en.text : stripHtml(en?.content || '');
  if (!plain) return 'Task from entry';
  // First sentence-ish or first 90 chars
  const firstSentence = plain.split(/[.!?]\s/)[0];
  const base = (firstSentence || plain).slice(0, 90).trim();
  return base || 'Task from entry';
}

// --- component ---------------------------------------------------
export default function EntryQuickAssign({ entry, onUpdated, onTaskCreated }) {
  const { token } = useContext(AuthContext);
  const [cluster, setCluster] = useState(() => primaryClusterReference(entry));
  const [clusters, setClusters] = useState([]);
  const [savingCluster, setSavingCluster] = useState(false);
  const [makingTask, setMakingTask] = useState(false);
  const [error, setError] = useState('');

  const entryISO = useMemo(() => entryDateISO(entry), [entry]);

  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  useEffect(() => {
    setCluster(primaryClusterReference(entry));
  }, [entry]);

  useEffect(() => {
    if (!token) {
      setClusters([]);
      return;
    }
    let ignore = false;
    axios.get('/api/clusters', { headers })
      .then(({ data }) => {
        if (!ignore) setClusters(normalizeClusterList(data));
      })
      .catch((e) => {
        if (!ignore) {
          console.warn('Failed to load clusters for entry quick assign', e?.response?.data || e.message);
          setClusters([]);
        }
      });
    return () => {
      ignore = true;
    };
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  async function saveCluster(nextCluster = cluster) {
    if (!entry?._id) return;
    const clusterId = resolveClusterId(nextCluster, clusters);
    if (nextCluster && !clusterId) {
      setError('That cluster is no longer available.');
      return;
    }
    setSavingCluster(true);
    setError('');
    try {
      const { data } = await axios.patch(
        `/api/entries/${entry._id}`,
        { clusters: clusterId ? [clusterId] : [], cluster: '' },
        { headers }
      );
      setCluster(primaryClusterReference(data));
      onUpdated?.(data);
    } catch (e) {
      console.error('Failed to save cluster', e?.response?.data || e.message);
      setError('Could not save cluster.');
    } finally {
      setSavingCluster(false);
    }
  }

  async function clearCluster() {
    setCluster('');
    await saveCluster('');
  }

  async function makeTaskFromEntry() {
    setMakingTask(true);
    setError('');
    try {
      // 1) create task
      const title = titleFromEntry(entry);
      const dueDate = entryISO || '';
      const { data: task } = await axios.post(
        '/api/tasks',
        { title, dueDate },
        { headers }
      );

      // 2) link it to the exact source entry (a day can contain multiple entries)
      const taskId = task?._id || task?.id;
      if (taskId && entry?._id) {
        await axios.post(
          `/api/tasks/${encodeURIComponent(taskId)}/link-entry`,
          { entryId: entry._id },
          { headers }
        );
      }

      onTaskCreated?.();
    } catch (e) {
      console.error('Failed to create/link task from entry', e?.response?.data || e.message);
      setError('Could not create task from entry.');
    } finally {
      setMakingTask(false);
    }
  }

  const selectedClusterKnown = !cluster || clusters.some((item) => (
    String(item.id) === String(cluster) || item.slug === cluster
  ));

  return (
    <div className="eq-assign" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <span className="muted" title={entryISO ? `Entry date: ${entryISO}` : 'No date on entry'}>
        📝
      </span>

      <select
        className="input"
        style={{ minWidth: 180 }}
        value={cluster}
        onChange={e => setCluster(e.target.value)}
        aria-label="Cluster"
      >
        <option value="">No cluster</option>
        {!selectedClusterKnown && <option value={cluster}>{cluster}</option>}
        {clusters.map((item) => (
          <option key={item.id || item.slug} value={item.id || item.slug}>
            {item.icon ? `${item.icon} ` : ''}{item.name || item.slug}
          </option>
        ))}
      </select>
      <button
        className="button chip"
        onClick={() => saveCluster()}
        disabled={savingCluster || !entry?._id}
        title="Save cluster to this entry"
      >
        {savingCluster ? 'Saving…' : 'Save'}
      </button>
      {(cluster || isClustered(entry)) && (
        <button
          className="button chip"
          onClick={clearCluster}
          disabled={savingCluster || !entry?._id}
          title="Clear cluster"
        >
          Clear
        </button>
      )}

      <span style={{ width: 1, height: 20, background: 'var(--line, #e5e7eb)' }} aria-hidden="true" />

      <button
        className="button chip"
        onClick={makeTaskFromEntry}
        disabled={makingTask}
        title={entryISO ? `Create a task due ${entryISO} from this entry` : 'Create a task from this entry'}
      >
        {makingTask ? 'Adding…' : 'Add task from entry'}
      </button>

      {error && <span className="text-sm text-red-600">{error}</span>}
    </div>
  );
}
