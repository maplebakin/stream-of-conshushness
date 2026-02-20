// frontend/src/TaskList.jsx
// src/TaskList.jsx
import React, { useContext, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from './api/axiosInstance';
import { AuthContext } from './AuthContext.jsx';
import { useToast } from './hooks/useToast.js';
import { todayISOInToronto } from './utils/date.js';
import './Main.css';
import './TaskList.css';
import { describeRepeat } from './utils/repeat.js';
import { useTasks } from './hooks/useTasks.js';
import { useQueryClient } from '@tanstack/react-query';

export default function TaskList({ date, header = 'Tasks' }) {
  const { token } = useContext(AuthContext);
  const { showUndo } = useToast();
  const today = useMemo(() => todayISOInToronto(), []);
  const isToday = date === today;
  const queryClient = useQueryClient();

  // Today-only toggles
  const [includeOverdue, setIncludeOverdue] = useState(true);
  const [includeRecurring, setIncludeRecurring] = useState(true);

  const { data: tasks = [], isLoading: loading } = useTasks(date, includeOverdue, includeRecurring, isToday);

  // Inbox panel
  const [showInbox, setShowInbox] = useState(false);
  const [inbox, setInbox] = useState([]);
  const [inboxCount, setInboxCount] = useState(0);

  // NEW: Add Task composer
  const [showComposer, setShowComposer] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [adding, setAdding] = useState(false);

  // Bulk operations state
  const [selectedTasks, setSelectedTasks] = useState(new Set());
  const [bulkActionLoading, setBulkActionLoading] = useState(false);

  const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};

  async function fetchInboxCount() {
    const { data } = await axios.get('/api/tasks?view=inbox&countOnly=1', { headers: authHeaders });
    setInboxCount(data?.count || 0);
  }

  async function fetchInbox() {
    const { data } = await axios.get('/api/tasks?view=inbox', { headers: authHeaders });
    setInbox(data || []);
  }

  useEffect(() => {
    fetchInboxCount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, includeOverdue, includeRecurring]);

  async function toggleComplete(task) {
    // Repeating: advance schedule
    if (!task.completed && task.repeat) {
      await axios.post(
        `/api/tasks/${task._id}/complete`,
        { fromDate: date },
        { headers: authHeaders }
      );
    } else {
      // Non-repeating: toggle completed
      await axios.patch(
        `/api/tasks/${task._id}`,
        { completed: !task.completed },
        { headers: authHeaders }
      );
    }
    queryClient.invalidateQueries(['tasks']);
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
    queryClient.invalidateQueries(['tasks']);
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
      queryClient.invalidateQueries(['tasks']);
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

  // Bulk operation helpers
  function toggleTaskSelection(taskId) {
    setSelectedTasks(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedTasks.size === tasks.length) {
      setSelectedTasks(new Set());
    } else {
      setSelectedTasks(new Set(tasks.map(t => t._id)));
    }
  }

  async function handleBulkComplete() {
    if (selectedTasks.size === 0) return;
    setBulkActionLoading(true);
    try {
      const ids = Array.from(selectedTasks);
      await axios.post('/api/tasks/bulk/complete', { ids }, { headers: authHeaders });
      // Refresh tasks
      await queryClient.invalidateQueries(['tasks']);
      setSelectedTasks(new Set());
    } catch (e) {
      console.error('Bulk complete failed:', e);
      alert('Failed to complete tasks. Please try again.');
    } finally {
      setBulkActionLoading(false);
    }
  }

  async function handleBulkDelete() {
    if (selectedTasks.size === 0) return;
    setBulkActionLoading(true);
    try {
      const ids = Array.from(selectedTasks);
      // Store tasks before deleting for undo
      const tasksToDelete = tasks.filter(t => selectedTasks.has(t._id));

      // Delete tasks
      await axios.post('/api/tasks/bulk/delete', { ids }, { headers: authHeaders });

      // Optimistically update UI
      queryClient.invalidateQueries(['tasks']);
      setSelectedTasks(new Set());

      // Show undo toast
      showUndo(
        `Deleted ${tasksToDelete.length} task${tasksToDelete.length > 1 ? 's' : ''}`,
        async () => {
          // Undo callback: recreate the tasks
          try {
            const recreatePromises = tasksToDelete.map(task =>
              axios.post('/api/tasks', {
                title: task.title,
                notes: task.notes || '',
                dueDate: task.dueDate,
                priority: task.priority || 0,
                clusters: task.clusters || [],
                sections: task.sections || [],
                rrule: task.rrule || '',
                completed: task.completed || false,
                status: task.status || 'todo',
              }, { headers: authHeaders })
            );
            await Promise.all(recreatePromises);
            // Refresh tasks after undo
            await queryClient.invalidateQueries(['tasks']);
          } catch (e) {
            console.error('Undo failed:', e);
            alert('Failed to undo deletion. Please try again.');
          }
        }
      );
    } catch (e) {
      console.error('Bulk delete failed:', e);
      alert('Failed to delete tasks. Please try again.');
      // Refresh to restore correct state
      await queryClient.invalidateQueries(['tasks']);
    } finally {
      setBulkActionLoading(false);
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

      {/* Bulk operations toolbar */}
      {selectedTasks.size > 0 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '12px',
          background: 'var(--bg-secondary)',
          borderRadius: '8px',
          marginBottom: '12px',
          border: '1px solid var(--border-primary)'
        }}>
          <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
            {selectedTasks.size} task{selectedTasks.size > 1 ? 's' : ''} selected
          </span>
          <button
            className="make-task-btn"
            type="button"
            onClick={handleBulkComplete}
            disabled={bulkActionLoading}
            title="Mark all selected tasks as complete"
          >
            ✓ Complete
          </button>
          <button
            className="set-cluster-btn"
            type="button"
            onClick={handleBulkDelete}
            disabled={bulkActionLoading}
            title="Delete all selected tasks"
            style={{ background: 'var(--status-error, #dc2626)', color: 'white' }}
          >
            Delete
          </button>
          <button
            className="add-task-btn"
            type="button"
            onClick={() => setSelectedTasks(new Set())}
            disabled={bulkActionLoading}
            title="Clear selection"
          >
            Clear
          </button>
        </div>
      )}

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
        <>
          {/* Select All checkbox */}
          {tasks.length > 0 && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 0',
              marginBottom: '8px',
              borderBottom: '1px solid var(--border-primary)'
            }}>
              <input
                type="checkbox"
                checked={selectedTasks.size === tasks.length && tasks.length > 0}
                onChange={toggleSelectAll}
                style={{ cursor: 'pointer' }}
                title="Select all tasks"
              />
              <label style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', cursor: 'pointer' }} onClick={toggleSelectAll}>
                Select all
              </label>
            </div>
          )}

          <ul className="tasks" style={{ listStyle: 'none', padding: 0, margin: '8px 0', display: 'grid', gap: 8 }}>
            {tasks.map(t => (
              <li
                key={t._id}
                className={`task-item ${t.completed ? 'done' : ''}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  background: selectedTasks.has(t._id) ? 'var(--bg-secondary)' : 'transparent',
                  padding: '8px',
                  borderRadius: '6px',
                  transition: 'background 0.2s'
                }}
              >
                <input
                  type="checkbox"
                  checked={selectedTasks.has(t._id)}
                  onChange={() => toggleTaskSelection(t._id)}
                  onClick={(e) => e.stopPropagation()}
                  style={{ cursor: 'pointer', flexShrink: 0 }}
                  title="Select task"
                />
                <button
                  className="checkbox"
                  onClick={() => toggleComplete(t)}
                  aria-label={t.completed ? 'Mark incomplete' : 'Mark complete'}
                  title={t.completed ? 'Mark incomplete' : 'Mark complete'}
                  style={{ flexShrink: 0 }}
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, flexWrap: 'wrap' }}>
                  <div className="task-title">{t.title}</div>
                  {t.clusters && t.clusters.length > 0 && t.clusters[0]?.slug && (
                    <Link
                      to={`/clusters/${t.clusters[0].slug}`}
                      className="cluster muted"
                      style={{ textDecoration: 'none', color: 'inherit' }}
                      title={`View cluster: ${t.clusters[0].name}`}
                    >
                      {t.clusters[0].icon && `${t.clusters[0].icon} `}{t.clusters[0].name}
                    </Link>
                  )}
                  {t.repeat && <div className="repeat muted">{describeRepeat(t.repeat)}</div>}
                  {t.dueDate && <div className="due muted">due {t.dueDate}</div>}
                </div>
              </li>
            ))}
          </ul>
        </>
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
