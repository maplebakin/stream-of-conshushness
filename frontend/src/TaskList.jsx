// src/TaskList.jsx
import React, { useContext, useEffect, useMemo, useState } from 'react';
import axios from './api/axiosInstance';
import { AuthContext } from './AuthContext.jsx';
import { todayISOInToronto } from './utils/date.js';
import './Main.css';
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
              includeRecurring: includeRecurring ? '1' : '0'
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
  // Completing a repeating task → advance it, not mark done permanently
  if (!task.completed && task.repeat) {
    const { data: updated } = await axios.post(
      `/api/tasks/${task._id}/complete`,
      { fromDate: date },                       // anchor from the day you're on
      { headers: authHeaders }
    );
    // If it advanced to a future day, remove from today's list
    if (updated.dueDate !== date) {
      setTasks(prev => prev.filter(t => t._id !== task._id));
    } else {
      setTasks(prev => prev.map(t => (t._id === task._id ? updated : t)));
    }
    return;
  }

  // Non-repeating tasks: simple toggle
  const { data: updated } = await axios.patch(
    `/api/tasks/${task._id}`,
    { completed: !task.completed },
    { headers: authHeaders }
  );
  setTasks(prev => prev.map(t => (t._id === task._id ? updated : t)));
}


  async function addInboxTaskToDay(task) {
    const { data: updated } = await axios.patch(
      `/api/tasks/${task._id}`,
      { dueDate: date },
      { headers: authHeaders }
    );
    // remove from inbox, decrement count, and add to the visible list
    setInbox(prev => prev.filter(x => x._id !== task._id));
    setInboxCount(c => Math.max(0, c - 1));
    setTasks(prev => [updated, ...prev]);
  }

  return (
    <div className="tasks-panel">
      <div className="panel-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <h3 className="font-thread text-vein">{header}</h3>
        {isToday && (
          <div className="toggles" style={{ display: 'flex', gap: 12 }}>
            <label className="muted">
              <input type="checkbox" checked={includeOverdue} onChange={() => setIncludeOverdue(v => !v)} />
              &nbsp;Carry-forward overdue
            </label>
            <label className="muted">
              <input type="checkbox" checked={includeRecurring} onChange={() => setIncludeRecurring(v => !v)} />
              &nbsp;Show recurring
            </label>
          </div>
        )}
      </div>

      {loading ? (
        <div className="muted">Loading…</div>
      ) : tasks.length === 0 ? (
        <div className="muted">No tasks due for this day.</div>
      ) : (
        <ul className="tasks" style={{ listStyle: 'none', padding: 0, margin: '8px 0', display: 'grid', gap: 8 }}>
          {tasks.map(t => (
            <li key={t._id} className={`task ${t.completed ? 'done' : ''}`} style={{ background: 'var(--card, #fff)', borderRadius: 12, padding: '10px 12px', boxShadow: '0 1px 4px rgba(0,0,0,.06)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                className="checkbox"
                onClick={() => toggleComplete(t)}
                aria-label={t.completed ? 'Mark incomplete' : 'Mark complete'}
                title={t.completed ? 'Mark incomplete' : 'Mark complete'}
                style={{ width: 18, height: 18, borderRadius: 4, border: '1px solid rgba(0,0,0,.2)', background: t.completed ? 'var(--mist, #e8e8e8)' : 'transparent' }}
              />
              <div className="title" style={{ flex: 1 }}>
                {t.title}
              </div>
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
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '6px 0', marginTop: 8 }}
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
                  <li key={t._id} className="task" style={{ background: 'var(--card, #fff)', borderRadius: 12, padding: '10px 12px', boxShadow: '0 1px 4px rgba(0,0,0,.06)', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div className="title" style={{ flex: 1 }}>{t.title}</div>
                    <button
                      className="small"
                      onClick={() => addInboxTaskToDay(t)}
                      title={`Set due date to ${date}`}
                      style={{ fontSize: '0.85rem', padding: '4px 8px', borderRadius: 8, border: '1px solid rgba(0,0,0,.12)', background: 'var(--color-background, #f7f5ed)' }}
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
