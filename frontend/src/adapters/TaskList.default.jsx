import { useContext, useEffect, useMemo, useState } from 'react';
import axios from '../api/axiosInstance.js';
import { AuthContext } from '../AuthContext.jsx';

function todayISO() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function normalizeTask(raw = {}) {
  if (!raw) return null;
  const sections = Array.isArray(raw.sections)
    ? raw.sections.map((s) => String(s))
    : raw.section
      ? [String(raw.section)]
      : [];
  const clusters = Array.isArray(raw.clusters)
    ? raw.clusters.map((c) => String(c))
    : raw.cluster
      ? [String(raw.cluster)]
      : [];

  return {
    _id: raw._id || raw.id,
    title: raw.title || '(untitled task)',
    notes: raw.notes || '',
    dueDate: raw.dueDate || '',
    completed: !!raw.completed,
    sections,
    clusters,
    priority: Number.isFinite(raw.priority) ? Number(raw.priority) : 0,
  };
}

function filterTasks(list, { view, targetDate, section, cluster }) {
  const filtered = list.filter((task) => {
    if (!task) return false;
    if (section && !(task.sections || []).some((s) => s.toLowerCase() === section.toLowerCase())) {
      return false;
    }
    if (cluster && !(task.clusters || []).some((c) => c.toLowerCase() === cluster.toLowerCase())) {
      return false;
    }

    const due = task.dueDate || '';
    switch (view) {
      case 'today':
        return !task.completed && due === targetDate;
      case 'overdue':
        return !task.completed && due && due < targetDate;
      case 'upcoming':
        return !task.completed && due && due > targetDate;
      case 'unscheduled':
        return !task.completed && !due;
      default:
        return true;
    }
  });

  return filtered.sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    if (a.dueDate !== b.dueDate) return (a.dueDate || '').localeCompare(b.dueDate || '');
    return (a.title || '').localeCompare(b.title || '');
  });
}

export default function TaskList({
  date,
  view = 'today',
  header = 'Tasks',
  section = '',
  cluster = '',
  wrap = true,
}) {
  const { token } = useContext(AuthContext);
  const targetDate = useMemo(() => date || todayISO(), [date]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) {
      setTasks([]);
      setLoading(false);
      return;
    }

    let ignore = false;

    async function fetchTasks() {
      setLoading(true);
      setError('');
      try {
        const params = new URLSearchParams();
        params.set('limit', '300');
        params.set('includeCompleted', '1');
        if (view === 'today') {
          params.set('dueDate', targetDate);
        }
        if (section) params.set('section', section);
        if (cluster) params.set('cluster', cluster);
        const res = await axios.get(`/api/tasks?${params.toString()}`);
        if (ignore) return;
        const raw = Array.isArray(res.data)
          ? res.data
          : Array.isArray(res.data?.data)
            ? res.data.data
            : res.data?.tasks || [];
        const normalized = raw
          .map(normalizeTask)
          .filter((t) => t && t._id);
        setTasks(normalized);
      } catch (err) {
        if (ignore) return;
        console.warn('[TaskList] fetch failed', err?.response?.data || err.message);
        setTasks([]);
        setError(err?.response?.data?.error || 'Failed to load tasks');
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    fetchTasks();
    return () => {
      ignore = true;
    };
  }, [token, targetDate, view]);

  const filtered = useMemo(
    () => filterTasks(tasks, { view, targetDate, section, cluster }),
    [tasks, view, targetDate, section, cluster],
  );

  async function toggle(task) {
    if (!token) return;
    const previous = tasks;
    setTasks((current) => current.map((t) => (t._id === task._id ? { ...t, completed: !t.completed } : t)));

    try {
      const resp = await axios.patch(`/api/tasks/${task._id}/toggle`);
      const updated = normalizeTask(resp?.data?.task || resp?.data || { ...task, completed: !task.completed });
      const spawned = resp?.data?.next ? normalizeTask(resp.data.next) : null;

      setTasks((current) => {
        const base = current.map((t) => (t._id === updated._id ? updated : t));
        if (spawned && !base.some((t) => t._id === spawned._id)) {
          return [...base, spawned];
        }
        return base;
      });
    } catch (errToggle) {
      try {
        await axios.patch(`/api/tasks/${task._id}`, { completed: !task.completed });
        setTasks((current) => current.map((t) => (t._id === task._id ? { ...t, completed: !t.completed } : t)));
      } catch (errFallback) {
        console.warn('[TaskList] toggle failed', errToggle?.response?.data || errToggle.message, errFallback?.response?.data || errFallback.message);
        setTasks(previous);
        setError('Could not update task');
      }
    }
  }

  const body = (
    <>
      <div className="section-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <h3 className="font-thread text-vein" style={{ margin: 0 }}>{header}</h3>
        <span className="muted" style={{ fontSize: '.9rem' }}>{targetDate}</span>
      </div>

      {!token && <div className="muted">Sign in to see tasks.</div>}
      {token && error && <div className="muted" role="alert">{error}</div>}
      {token && loading && <div className="muted">Loading tasks…</div>}
      {token && !loading && filtered.length === 0 && <div className="muted">No tasks match this view.</div>}

      {token && !loading && filtered.length > 0 && (
        <ul className="task-list" style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
          {filtered.map((task) => (
            <li
              key={task._id}
              className={`task-row ${task.completed ? 'is-completed' : ''}`}
              style={{
                display: 'grid',
                gridTemplateColumns: 'auto 1fr auto',
                alignItems: 'start',
                gap: 10,
                padding: '10px 12px',
                border: '1px solid var(--border, #e6e6ea)',
                borderRadius: 10,
                background: 'var(--card, #fff)',
              }}
            >
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={task.completed}
                  onChange={() => toggle(task)}
                  aria-label={task.completed ? 'Mark task incomplete' : 'Mark task complete'}
                />
              </label>

              <div className="task-main" style={{ minWidth: 0 }}>
                <div className={`task-title ${task.completed ? 'line' : ''}`} style={{ fontWeight: 600, wordBreak: 'break-word' }}>
                  {task.title}
                </div>
                {task.notes && (
                  <div className={`task-notes ${task.completed ? 'muted' : ''}`} style={{ fontSize: '.92rem', marginTop: 4, opacity: task.completed ? 0.6 : 0.9 }}>
                    {task.notes}
                  </div>
                )}
                <div className="task-meta" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                  {task.dueDate && <span className="pill pill-muted">due {task.dueDate}</span>}
                  {task.clusters?.length > 0 && <span className="pill">{task.clusters.join(' • ')}</span>}
                  {task.sections?.length > 0 && <span className="pill pill-muted">{task.sections.join(' • ')}</span>}
                </div>
              </div>

              <div />
            </li>
          ))}
        </ul>
      )}
    </>
  );

  if (!wrap) return body;
  return <div className="card">{body}</div>;
}
