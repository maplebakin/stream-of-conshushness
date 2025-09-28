import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import axios from '../api/axiosInstance';
import TaskModal from '../TaskModal.jsx';
import EntryModal from '../EntryModal.jsx';
import SafeHTML from '../components/SafeHTML.jsx';
import { normalizeClusterList, normalizeCluster, slugifyCluster } from '../utils/clusterHelpers.js';
import '../Main.css';
import './ClusterRoom.css';

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'entries', label: 'Entries' }
];

function torontoParts(date = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const parts = fmt.formatToParts(date);
  const y = parts.find((p) => p.type === 'year')?.value;
  const m = parts.find((p) => p.type === 'month')?.value;
  const d = parts.find((p) => p.type === 'day')?.value;
  return { y, m, d };
}

function torontoTodayISO() {
  const { y, m, d } = torontoParts();
  return `${y}-${m}-${d}`;
}

function isoDaysAgo(days = 0) {
  const base = new Date();
  base.setHours(12, 0, 0, 0);
  base.setDate(base.getDate() - days);
  const { y, m, d } = torontoParts(base);
  return `${y}-${m}-${d}`;
}

function formatDate(iso) {
  if (!iso) return '—';
  const date = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function normalizeArray(payload) {
  const data = payload?.data ?? payload;
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data)) return data.data;
  return [];
}

function entrySnippet(entry) {
  const plain = entry?.summary || entry?.text || entry?.content || '';
  if (typeof plain !== 'string') return '';
  return plain.replace(/<[^>]+>/g, '').trim();
}

export default function ClusterRoom() {
  const { clusterSlug } = useParams();
  const navigate = useNavigate();

  const [activeCluster, setActiveCluster] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [editOpen, setEditOpen] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');
  const [editForm, setEditForm] = useState({ name: '', slug: '', color: '#9b87f5', icon: '🗂️' });

  const [tasks, setTasks] = useState([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksError, setTasksError] = useState('');

  const [entries, setEntries] = useState([]);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [entriesError, setEntriesError] = useState('');

  const [overview, setOverview] = useState({ openTasks: 0, entriesLast7: 0 });

  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showEntryModal, setShowEntryModal] = useState(false);

  const todayISO = useMemo(() => torontoTodayISO(), []);
  const startISO = useMemo(() => isoDaysAgo(6), []);

  const loadClusterData = useCallback(async (cluster) => {
    if (!cluster?.id) return;
    setTasksLoading(true);
    setEntriesLoading(true);
    setTasksError('');
    setEntriesError('');

    const [tasksResult, entriesResult] = await Promise.allSettled([
      axios.get('/api/tasks', {
        params: {
          clusterId: cluster.id,
          includeCompleted: '1',
          limit: 200
        }
      }),
      axios.get('/api/entries', {
        params: {
          clusterId: cluster.id,
          startDate: startISO,
          endDate: todayISO,
          limit: 50
        }
      })
    ]);

    let tasksData = [];
    if (tasksResult.status === 'fulfilled') {
      tasksData = normalizeArray(tasksResult.value).map((t) => ({
        ...t,
        dueDate: t.dueDate || '',
        title: t.title || 'Untitled task'
      }));
      tasksData.sort((a, b) => {
        if (!!a.completed !== !!b.completed) return a.completed ? 1 : -1;
        if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) return a.dueDate.localeCompare(b.dueDate);
        if (!a.dueDate && b.dueDate) return 1;
        if (a.dueDate && !b.dueDate) return -1;
        return (a.title || '').localeCompare(b.title || '');
      });
      setTasks(tasksData);
    } else {
      setTasks([]);
      setTasksError(tasksResult.reason?.response?.data?.error || tasksResult.reason?.message || 'Failed to load tasks.');
    }

    let entriesData = [];
    if (entriesResult.status === 'fulfilled') {
      entriesData = normalizeArray(entriesResult.value);
      entriesData.sort((a, b) => {
        const aKey = `${a.date || ''}T${a.createdAt || ''}`;
        const bKey = `${b.date || ''}T${b.createdAt || ''}`;
        return aKey > bKey ? -1 : aKey < bKey ? 1 : 0;
      });
      setEntries(entriesData);
    } else {
      setEntries([]);
      setEntriesError(entriesResult.reason?.response?.data?.error || entriesResult.reason?.message || 'Failed to load entries.');
    }

    setOverview({
      openTasks: tasksData.filter((t) => !t.completed).length,
      entriesLast7: entriesData.length
    });

    setTasksLoading(false);
    setEntriesLoading(false);
  }, [startISO, todayISO]);

  useEffect(() => {
    async function loadClusters() {
      setLoading(true);
      setLoadError('');
      try {
        const res = await axios.get('/api/clusters');
        const list = normalizeClusterList(res);
        const match = list.find((c) => c.slug === clusterSlug) || null;
        if (!match) {
          setActiveCluster(null);
          setLoadError(list.length ? 'We could not find that cluster.' : 'No clusters yet.');
        } else {
          setActiveCluster(match);
        }
      } catch (err) {
        console.error('Cluster load failed:', err);
        setActiveCluster(null);
        setLoadError(err?.response?.data?.error || err.message || 'Failed to load clusters.');
      } finally {
        setLoading(false);
      }
    }

    loadClusters();
  }, [clusterSlug]);

  useEffect(() => {
    if (!activeCluster) return;
    setEditForm({
      name: activeCluster.name,
      slug: activeCluster.slug,
      color: activeCluster.color,
      icon: activeCluster.icon
    });
    setEditError('');
    setEditOpen(false);
    loadClusterData(activeCluster);
  }, [activeCluster, loadClusterData]);

  function handleTabChange(tab) {
    setActiveTab(tab);
  }

  async function handleToggleTask(task) {
    try {
      await axios.patch(`/api/tasks/${task._id}`, { completed: !task.completed });
      await loadClusterData(activeCluster);
    } catch (err) {
      console.error('Toggle task failed:', err);
      setTasksError('Could not update task.');
    }
  }

  async function handleRefresh() {
    if (!activeCluster) return;
    await loadClusterData(activeCluster);
  }

  function beginEdit() {
    if (!activeCluster) return;
    setEditForm({
      name: activeCluster.name,
      slug: activeCluster.slug,
      color: activeCluster.color,
      icon: activeCluster.icon
    });
    setEditError('');
    setEditOpen(true);
  }

  async function submitEdit(e) {
    e?.preventDefault?.();
    if (!activeCluster) return;

    const updates = {};
    const nextName = editForm.name.trim();
    const nextSlug = slugifyCluster(editForm.slug);
    if (!nextName) {
      setEditError('Name is required.');
      return;
    }
    if (!nextSlug) {
      setEditError('Slug is required.');
      return;
    }
    if (nextName !== activeCluster.name) updates.name = nextName;
    if (nextSlug !== activeCluster.slug) updates.slug = nextSlug;
    if (editForm.color !== activeCluster.color) updates.color = editForm.color;
    if (editForm.icon !== activeCluster.icon) updates.icon = editForm.icon;

    if (!Object.keys(updates).length) {
      setEditOpen(false);
      return;
    }

    setEditSaving(true);
    setEditError('');
    try {
      const res = await axios.put(`/api/clusters/${activeCluster.id}`, updates);
      const updated = normalizeCluster(res?.data?.data ?? res?.data ?? null);
      if (!updated) throw new Error('Unexpected response');
      setActiveCluster(updated);
      setEditOpen(false);
      if (updated.slug !== activeCluster.slug) {
        navigate(`/clusters/${encodeURIComponent(updated.slug)}`, { replace: true });
      }
    } catch (err) {
      console.error('Update cluster failed:', err);
      setEditError(err?.response?.data?.error || err.message || 'Failed to update cluster.');
    } finally {
      setEditSaving(false);
    }
  }

  async function handleDelete() {
    if (!activeCluster) return;
    if (!window.confirm(`Delete ${activeCluster.name}? This cannot be undone.`)) return;
    try {
      await axios.delete(`/api/clusters/${activeCluster.id}`);
      setActiveCluster(null);
      navigate('/clusters');
    } catch (err) {
      console.error('Delete cluster failed:', err);
      setEditError(err?.response?.data?.error || err.message || 'Failed to delete cluster.');
    }
  }

  function renderOverview() {
    const activeColor = activeCluster?.color || '#9b87f5';
    const previewTasks = tasks.filter((t) => !t.completed).slice(0, 3);
    const previewEntries = entries.slice(0, 3);

    return (
      <div className="cluster-detail__section">
        <div className="cluster-detail__stats">
          <div className="cluster-detail__stat-card" style={{ borderColor: activeColor }}>
            <span className="cluster-detail__stat-label">Open tasks</span>
            <span className="cluster-detail__stat-value">{overview.openTasks}</span>
          </div>
          <div className="cluster-detail__stat-card" style={{ borderColor: activeColor }}>
            <span className="cluster-detail__stat-label">Entries (last 7 days)</span>
            <span className="cluster-detail__stat-value">{overview.entriesLast7}</span>
          </div>
        </div>

        <div className="cluster-detail__quick">
          <button type="button" className="pill" onClick={() => setShowTaskModal(true)}>+ Task</button>
          <button type="button" className="pill" onClick={() => setShowEntryModal(true)}>+ Entry</button>
          <button type="button" className="pill pill-muted" onClick={handleRefresh}>Refresh</button>
        </div>

        <div className="cluster-detail__preview-grid">
          <div className="cluster-detail__preview-card">
            <div className="cluster-detail__preview-head">
              <h3>Next up</h3>
              <Link to="#tasks" onClick={() => setActiveTab('tasks')}>View all</Link>
            </div>
            {tasksLoading ? (
              <p className="muted">Loading tasks…</p>
            ) : tasksError ? (
              <p className="muted">{tasksError}</p>
            ) : !previewTasks.length ? (
              <p className="muted">No open tasks right now.</p>
            ) : (
              <ul className="cluster-detail__preview-list">
                {previewTasks.map((task) => (
                  <li key={task._id}>
                    <span>{task.title}</span>
                    <small>{task.dueDate ? formatDate(task.dueDate) : 'No due date'}</small>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="cluster-detail__preview-card">
            <div className="cluster-detail__preview-head">
              <h3>Recent entries</h3>
              <Link to="#entries" onClick={() => setActiveTab('entries')}>View all</Link>
            </div>
            {entriesLoading ? (
              <p className="muted">Loading entries…</p>
            ) : entriesError ? (
              <p className="muted">{entriesError}</p>
            ) : !previewEntries.length ? (
              <p className="muted">No entries in the last week.</p>
            ) : (
              <ul className="cluster-detail__preview-list">
                {previewEntries.map((entry) => (
                  <li key={entry._id}>
                    <span>{formatDate(entry.date || entry.createdAt)}</span>
                    <small>{entrySnippet(entry).slice(0, 80) || '—'}</small>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    );
  }

  function renderTasks() {
    return (
      <div className="cluster-detail__section" id="tasks">
        <div className="cluster-detail__actions-row">
          <div className="cluster-detail__actions-group">
            <button type="button" className="pill" onClick={() => setShowTaskModal(true)}>+ Task</button>
            <button type="button" className="pill pill-muted" onClick={handleRefresh}>Refresh</button>
          </div>
        </div>
        {tasksLoading ? (
          <p className="muted">Loading tasks…</p>
        ) : tasksError ? (
          <p className="error-text">{tasksError}</p>
        ) : !tasks.length ? (
          <p className="muted">No tasks yet. Create one to get started.</p>
        ) : (
          <ul className="cluster-detail__tasks">
            {tasks.map((task) => (
              <li key={task._id} className={`cluster-detail__task ${task.completed ? 'is-complete' : ''}`}>
                <label>
                  <input type="checkbox" checked={!!task.completed} onChange={() => handleToggleTask(task)} />
                  <span className="cluster-detail__task-title">{task.title}</span>
                </label>
                <div className="cluster-detail__task-meta">
                  <span>{task.dueDate ? formatDate(task.dueDate) : 'No due date'}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  function renderEntries() {
    return (
      <div className="cluster-detail__section" id="entries">
        <div className="cluster-detail__actions-row">
          <div className="cluster-detail__actions-group">
            <button type="button" className="pill" onClick={() => setShowEntryModal(true)}>+ Entry</button>
            <button type="button" className="pill pill-muted" onClick={handleRefresh}>Refresh</button>
          </div>
        </div>
        {entriesLoading ? (
          <p className="muted">Loading entries…</p>
        ) : entriesError ? (
          <p className="error-text">{entriesError}</p>
        ) : !entries.length ? (
          <p className="muted">No entries for this range yet.</p>
        ) : (
          <div className="cluster-detail__entries">
            {entries.map((entry) => (
              <article key={entry._id} className="entry-card">
                <header className="cluster-detail__entry-head">
                  <span className="pill">{formatDate(entry.date || entry.createdAt)}</span>
                  {Array.isArray(entry.tags) && entry.tags.length > 0 && (
                    <div className="cluster-detail__entry-tags">
                      {entry.tags.slice(0, 4).map((tag) => (
                        <span key={tag} className="pill pill-muted">#{tag}</span>
                      ))}
                    </div>
                  )}
                </header>
                <SafeHTML
                  className="cluster-detail__entry-body"
                  html={
                    entry?.html && entry.html.trim()
                      ? entry.html
                      : typeof entry?.content === 'string' && /<[^>]+>/.test(entry.content)
                        ? entry.content
                        : (entry?.text || '').replace(/\n/g, '<br/>')
                  }
                />
              </article>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="page cluster-detail">
      <header
        className="cluster-detail__header"
        style={{ '--cluster-color': activeCluster?.color || '#9b87f5' }}
      >
        <div className="cluster-detail__header-top">
          <Link to="/clusters" className="cluster-detail__back">
            ← Back to clusters
          </Link>
          {activeCluster && (
            <div className="cluster-detail__header-actions">
              <button type="button" className="pill pill-muted" onClick={beginEdit}>Rename</button>
              <button type="button" className="pill cluster-detail__delete" onClick={handleDelete}>Delete</button>
            </div>
          )}
        </div>

        {loading ? (
          <h1 className="cluster-detail__title">Loading…</h1>
        ) : loadError ? (
          <div className="cluster-detail__error">{loadError}</div>
        ) : !activeCluster ? (
          <h1 className="cluster-detail__title">Select a cluster</h1>
        ) : (
          <div className="cluster-detail__identity">
            <span className="cluster-detail__icon" aria-hidden="true">{activeCluster.icon}</span>
            <div>
              <h1 className="cluster-detail__title">{activeCluster.name}</h1>
              <p className="cluster-detail__slug">#{activeCluster.slug}</p>
            </div>
          </div>
        )}

        {editOpen && (
          <form className="cluster-detail__edit" onSubmit={submitEdit}>
            <div className="cluster-detail__edit-grid">
              <label>
                <span>Name</span>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))}
                  required
                />
              </label>
              <label>
                <span>Slug</span>
                <input
                  type="text"
                  value={editForm.slug}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, slug: e.target.value }))}
                  required
                />
              </label>
              <label>
                <span>Color</span>
                <input
                  type="color"
                  value={editForm.color}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, color: e.target.value }))}
                />
              </label>
              <label>
                <span>Icon</span>
                <input
                  type="text"
                  value={editForm.icon}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, icon: e.target.value }))}
                />
              </label>
            </div>
            {editError && <div className="error-text" style={{ marginTop: '0.5rem' }}>{editError}</div>}
            <div className="cluster-detail__edit-actions">
              <button type="button" className="pill pill-muted" onClick={() => setEditOpen(false)} disabled={editSaving}>Cancel</button>
              <button type="submit" className="pill" disabled={editSaving}>{editSaving ? 'Saving…' : 'Save changes'}</button>
            </div>
          </form>
        )}
      </header>

      {activeCluster && (
        <nav className="cluster-detail__tabs" role="tablist">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              className={`cluster-detail__tab ${activeTab === tab.key ? 'is-active' : ''}`}
              onClick={() => handleTabChange(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      )}

      {activeCluster && activeTab === 'overview' && renderOverview()}
      {activeCluster && activeTab === 'tasks' && renderTasks()}
      {activeCluster && activeTab === 'entries' && renderEntries()}

      {showTaskModal && activeCluster && (
        <TaskModal
          isOpen
          onClose={() => setShowTaskModal(false)}
          onSaved={() => {
            setShowTaskModal(false);
            loadClusterData(activeCluster);
          }}
          defaultCluster={activeCluster.slug}
        />
      )}

      {showEntryModal && activeCluster && (
        <EntryModal
          onClose={() => setShowEntryModal(false)}
          onSaved={() => {
            setShowEntryModal(false);
            loadClusterData(activeCluster);
          }}
          defaultCluster={activeCluster.slug}
        />
      )}
    </div>
  );
}
