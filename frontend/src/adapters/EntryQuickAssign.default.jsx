// frontend/src/adapters/EntryQuickAssign.default.jsx
import React, { useContext, useEffect, useMemo, useState } from 'react';
import axios from '../api/axiosInstance';
import { AuthContext } from '../AuthContext.jsx';

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

function normalizeClusters(payload) {
  const raw = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.data)
      ? payload.data
      : [];
  return raw
    .map((cluster) => {
      const name = cluster?.name || cluster?.title || cluster?.label || '';
      const slug = cluster?.slug || (name ? String(name).toLowerCase().replace(/\s+/g, '-') : '');
      return {
        id: cluster?._id || cluster?.id || slug,
        name,
        slug,
        icon: cluster?.icon || cluster?.emoji || '',
      };
    })
    .filter((cluster) => cluster.id && cluster.slug);
}

// --- component ---------------------------------------------------
export default function EntryQuickAssign({ entry, onUpdated, onTaskCreated }) {
  const { token } = useContext(AuthContext);
  const [cluster, setCluster] = useState(entry?.cluster || '');
  const [clusters, setClusters] = useState([]);
  const [savingCluster, setSavingCluster] = useState(false);
  const [makingTask, setMakingTask] = useState(false);
  const [error, setError] = useState('');

  const entryISO = useMemo(() => entryDateISO(entry), [entry]);

  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  useEffect(() => {
    setCluster(entry?.cluster || '');
  }, [entry?.cluster]);

  useEffect(() => {
    if (!token) {
      setClusters([]);
      return;
    }
    let ignore = false;
    axios.get('/api/clusters', { headers })
      .then(({ data }) => {
        if (!ignore) setClusters(normalizeClusters(data));
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
    setSavingCluster(true);
    setError('');
    try {
      const { data } = await axios.patch(`/api/entries/${entry._id}`, { cluster: nextCluster }, { headers });
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

      // 2) link it to this entry’s date (autoCreate not needed if entry already exists)
      const taskId = task?._id || task?.id;
      if (taskId && dueDate) {
        await axios.post(
          `/api/tasks/${encodeURIComponent(taskId)}/link-entry`,
          { date: dueDate, autoCreate: false },
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

  const selectedClusterKnown = !cluster || clusters.some((item) => item.slug === cluster);

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
          <option key={item.id} value={item.slug}>
            {item.icon ? `${item.icon} ` : ''}{item.name || item.slug}
          </option>
        ))}
      </select>
      <button
        className="button chip"
        onClick={saveCluster}
        disabled={savingCluster || !entry?._id}
        title="Save cluster to this entry"
      >
        {savingCluster ? 'Saving…' : 'Save'}
      </button>
      {entry?.cluster && (
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
