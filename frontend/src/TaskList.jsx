// frontend/src/TaskList.jsx
// src/TaskList.jsx
import React, { useContext, useEffect, useMemo, useState } from 'react';
import axios from './api/axiosInstance';
import { AuthContext } from './AuthContext.jsx';
import { todayISOInToronto } from './utils/date.js';
import './Main.css';
import './TaskList.css';
import { describeRepeat } from './utils/repeat.js';

export default function TaskList({ date, header = 'Tasks' }) {
  const { token } = useContext(AuthContext);
  const today = useMemo(() => todayISOInToronto(), []);
  const isToday = date === today;

  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  // Today-only toggles
  const [includeOverdue, setIncludeOverdue] = useState(true);
  const [includeRecurring, setIncludeRecurring] = useState(true);

  // Inbox panel
  const [showInbox, setShowInbox] = useState(false);
  const [inbox, setInbox] = useState([]);
  const [inboxCount, setInboxCount] = useState(0);

  // NEW: Add Task composer
  const [showComposer, setShowComposer] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [adding, setAdding] = useState(false);

  const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};

  async function fetchTasks() {
    setLoading(true);
    try {
      const params = new URLSearchParams(
        isToday
          ? {
              view: 'today',
              date,
              includeOverdue: includeOverdue ? '1' : '0',
              includeRecurring: includeRecurring ? '1' : '0',
            }
          : { view: 'date', date }
      );
      const { data } = await axios.get(`/api/tasks?${params.toString()}`, { headers: authHeaders });
      setTasks(data);
    } finally {
      setLoading(false);
    }
  }

  async function fetchInboxCount() {
    const { data } = await axios.get('/api/tasks?view=inbox&countOnly=1', { headers: authHeaders });
    setInboxCount(data?.count || 0);
  }

  async function fetchInbox() {
    const { data } = await axios.get('/api/tasks?view=inbox', { headers: authHeaders });
    setInbox(data || []);
  }

  useEffect(() => {
    fetchTasks();
    fetchInboxCount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, includeOverdue, includeRecurring]);

  async function toggleComplete(task) {
    // Repeating: advance schedule
    if (!task.completed && task.repeat) {
      const { data: updated } = await axios.post(
        `/api/tasks/${task._id}/complete`,
        { fromDate: date },
        { headers: authHeaders }
      );
      // If it moved to a different date, remove from this list
      if (updated.dueDate !== date) {
        setTasks(prev => prev.filter(t => t._id !== task._id));
      } else {
        setTasks(prev => prev.map(t => (t._id === task._id ? updated : t)));
      }
      return;
    }

    // Non-repeating: toggle completed
    const { data: updated } = await axios.patch(
      `/api/tasks/${task._id}`,
      { completed: !task.completed },
      { headers: authHeaders }
    );
    setTasks(prev => prev.map(t => (t._id === task._id ? updated : t)));
  }

  // --- helper: link a task to the day's journal entry (create entry if missing)
  async function linkEntryForDate(taskId, dayISO) {
    if (!taskId || !dayISO) return;
    try {
      await axios.post(
        `/api/tasks/${encodeURIComponent(taskId)}/link-entry`,
        { date: dayISO, autoCreate: true, title: `Journal for ${dayISO}` },
        { headers: authHeaders }
      );
    } catch (e) {
      console.warn('Link-to-entry failed:', e?.response?.data || e.message, e);
    }
  }

  async function addInboxTaskToDay(task) {
    const { data: updated } = await axios.patch(
      `/api/tasks/${task._id}`,
      { dueDate: date },
      { headers: authHeaders }
    );
    // Optimistic UI first
    setInbox(prev => prev.filter(x => x._id !== task._id));
    setInboxCount(c => Math.max(0, c - 1));
    setTasks(prev => [updated, ...prev]);
    // Then try to link to journal entry for that date
    linkEntryForDate(updated._id, date);
  }

  // NEW: create task directly from header composer (and link it to the day)
  async function createTask() {
    const title = (newTitle || '').trim();
    if (!title) return;
    setAdding(true);
    try {
      const { data } = await axios.post(
        '/api/tasks',
        { title, dueDate: date },
        { headers: authHeaders }
      );
      setTasks(prev => [data, ...prev]);
      setNewTitle('');
      setShowComposer(false);
      // Link the freshly created task to this day's journal
      linkEntryForDate(data._id || data.id, date);
    } catch (e) {
      console.error('Failed to create task', e);
      // optional: toast
    } finally {
      setAdding(false);
    }
  }

  function handleComposerKey(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      createTask();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setShowComposer(false);
      setNewTitle('');
    }
  }

  return (
    <div className="task-list">
      <div className="task-list-header">
        <h3 className="font-thread text-vein">{header}</h3>

        {/* Right side: toggles + add task */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {isToday && (
            <div className="task-toggles">
              <button
                className={`pill-toggle ${includeOverdue ? 'active' : ''}`}
                aria-pressed={includeOverdue}
                type="button"
                onClick={() => setIncludeOverdue(v => !v)}
                title="Show overdue items in today's view"
              >
                Carry-forward
              </button>
              <button
                className={`pill-toggle ${includeRecurring ? 'active' : ''}`}
                aria-pressed={includeRecurring}
                type="button"
                onClick={() => setIncludeRecurring(v => !v)}
                title="Show repeating tasks that are due"
              >
                Recurring
              </button>
            </div>
          )}

          {/* Add Task trigger */}
          {!showComposer && (
            <button
              className="add-task-btn"
              type="button"
              onClick={() => setShowComposer(true)}
              title="Add a task for this day"
            >
              + Add task
            </button>
          )}
        </div>
      </div>

      {/* Inline composer */}
      {showComposer && (
        <div
          className="add-task-row"
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr auto auto',
            gap: 8,
            marginBottom: 12,
            alignItems: 'center'
          }}
        >
          <input
            className="add-task-input input"
            autoFocus
            placeholder="New task…"
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            onKeyDown={handleComposerKey}
          />
          <button
            className="make-task-btn"
            type="button"
            onClick={createTask}
            disabled={adding || !newTitle.trim()}
          >
            Add
          </button>
          <button
            className="set-cluster-btn"
            type="button"
            onClick={() => { setShowComposer(false); setNewTitle(''); }}
            disabled={adding}
          >
            Cancel
          </button>
        </div>
      )}

      {loading ? (
        <div className="muted">Loading…</div>
      ) : tasks.length === 0 ? (
        <div className="muted">No tasks due for this day.</div>
      ) : (
        <ul className="tasks" style={{ listStyle: 'none', padding: 0, margin: '8px 0', display: 'grid', gap: 8 }}>
          {tasks.map(t => (
            <li
              key={t._id}
              className={`task-item ${t.completed ? 'done' : ''}`}
            >
              <button
                className="checkbox"
                onClick={() => toggleComplete(t)}
                aria-label={t.completed ? 'Mark incomplete' : 'Mark complete'}
                title={t.completed ? 'Mark incomplete' : 'Mark complete'}
              />
              <div className="task-title">{t.title}</div>
              {t.cluster && <div className="cluster muted">{t.cluster}</div>}
              {t.repeat && <div className="repeat muted">{describeRepeat(t.repeat)}</div>}
              {t.dueDate && <div className="due muted">due {t.dueDate}</div>}
            </li>
          ))}
        </ul>
      )}

      {/* Inbox (undated) — collapsed by default */}
      <div className="inbox">
        <button
          className="inbox-toggle"
          onClick={() => {
            const next = !showInbox;
            setShowInbox(next);
            if (next && inbox.length === 0) fetchInbox();
          }}
        >
          {showInbox ? '▼' : '▶'} Inbox (undated) — {inboxCount}
        </button>

        {showInbox && (
          <div className="inbox-panel" style={{ marginTop: 8 }}>
            {inbox.length === 0 ? (
              <div className="muted">No undated tasks.</div>
            ) : (
              <ul className="tasks" style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
                {inbox.map(t => (
                  <li key={t._id} className="task-item">
                    <div className="task-title">{t.title}</div>
                    <button
                      className="make-task-btn"
                      onClick={() => addInboxTaskToDay(t)}
                      title={`Set due date to ${date}`}
                    >
                      Add to this day
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
