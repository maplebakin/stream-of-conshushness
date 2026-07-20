import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import axios from '../api/axiosInstance';
import { AuthContext } from '../AuthContext.jsx';
import { todayISOInToronto } from '../utils/date.js';
import { isISODate, taskCreatePayload, taskMatchesScope } from '../utils/taskInbox.js';
import { taskRecurrenceLabel } from '../utils/taskRecurrence.js';
import { clearRequestId, stableRequestId } from '../utils/idempotency.js';

function useAuthHeaders() {
  const { token } = useContext(AuthContext) || {};
  return useMemo(() => (token ? { Authorization: `Bearer ${token}` } : {}), [token]);
}

function normalizeTasks(payload) {
  const p = payload?.data ?? payload;
  const arr = Array.isArray(p) ? p : (Array.isArray(p?.data) ? p.data : []);
  return arr.map(t => ({
    _id: t._id || t.id,
    title: t.title || t.text || '',
    dueDate: t.dueDate || t.date || null,
    completed: !!t.completed,
    section: t.section || t.cluster || '',
    priority: t.priority ?? null,
    entryId: t.entryId || null,
    rrule: typeof t.rrule === 'string' ? t.rrule : '',
    repeat: t.repeat || null,
    createdAt: t.createdAt, updatedAt: t.updatedAt,
  })).filter(t => t._id);
}

function taskActionError(error, fallback) {
  return error?.response?.data?.error || error?.message || fallback;
}

export default function InboxTasksPage() {
  const { date: routeDateParam = '' } = useParams();
  const routeDate = isISODate(routeDateParam) ? routeDateParam : '';
  const headers = useAuthHeaders();
  const [allTasks, setAllTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [scope, setScope] = useState(() => (routeDate ? 'date' : 'active'));
  const [selected, setSelected] = useState(() => new Set());
  const [busyIds, setBusyIds] = useState(() => new Set());
  const [newTitle, setNewTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const creatingRef = useRef(false);
  const createRequestIdRef = useRef(null);
  const [bulkDate, setBulkDate] = useState('');
  const [editId, setEditId] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const editCancelledRef = useRef(false);
  const today = todayISOInToronto();

  useEffect(() => {
    setScope(routeDate ? 'date' : 'active');
  }, [routeDate]);

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const res = await axios.get('/api/tasks?includeCompleted=1', { headers });
      setAllTasks(normalizeTasks(res));
      setSelected(new Set());
    } catch (e) {
      console.error('[InboxTasks] load failed', e?.response?.data || e);
      setErr(e?.response?.data?.error || 'Failed to load tasks.');
      setAllTasks([]);
    } finally {
      setLoading(false);
    }
  }, [headers]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const text = q.trim().toLowerCase();
    return allTasks.filter(t => {
      const matchQ = !text || t.title.toLowerCase().includes(text);
      if (!matchQ) return false;
      return taskMatchesScope(t, scope, { today, routeDate });
    }).sort((a,b) => {
      // prioritize active + date asc + createdAt
      const ac = (a.completed?1:0) - (b.completed?1:0);
      if (ac !== 0) return ac;
      const ad = isISODate(a.dueDate) ? a.dueDate : '9999-12-31';
      const bd = isISODate(b.dueDate) ? b.dueDate : '9999-12-31';
      if (ad !== bd) return ad < bd ? -1 : 1;
      return (a.createdAt || '').localeCompare(b.createdAt || '');
    });
  }, [allTasks, q, routeDate, scope, today]);

  const allSelected = selected.size > 0 && filtered.length > 0 && filtered.every(t => selected.has(t._id));
  const anySelected = selected.size > 0;

  function toggleSelect(id) {
    setSelected(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }
  function setSelectAll(on) {
    setSelected(on ? new Set(filtered.map(t => t._id)) : new Set());
  }

  async function createTask() {
    if (creatingRef.current) return;
    const title = newTitle.trim();
    if (!title) return;
    creatingRef.current = true;
    setCreating(true);
    setErr('');
    try {
      const payload = taskCreatePayload(title, routeDate);
      const requestId = stableRequestId(createRequestIdRef, JSON.stringify(payload), 'task');
      const { data } = await axios.post('/api/tasks', payload, {
        headers: { ...headers, 'Idempotency-Key': requestId },
      });
      clearRequestId(createRequestIdRef);
      const created = normalizeTasks([data])[0] || {
        _id: data._id || data.id,
        title: data.title || title,
        completed: Boolean(data.completed),
        dueDate: data.dueDate || null,
        section: data.section || '',
        entryId: data.entryId || null,
        rrule: typeof data.rrule === 'string' ? data.rrule : '',
        repeat: data.repeat || null,
      };
      setAllTasks(ts => [created, ...ts]);
      setNewTitle('');
    } catch (e) {
      console.warn('[InboxTasks] create failed', e?.response?.data || e);
      setErr(taskActionError(e, 'Could not create the task.'));
    } finally {
      creatingRef.current = false;
      setCreating(false);
    }
  }

  async function patch(id, body) {
    setBusyIds(s => new Set(s).add(id));
    setErr('');
    try {
      const { data } = await axios.patch(`/api/tasks/${id}`, body, { headers });
      setAllTasks(ts => ts.map(t => t._id === id ? { ...t, ...normalizeTasks([data])[0] } : t));
      return true;
    } catch (e) {
      console.warn('[InboxTasks] patch failed', e?.response?.data || e);
      setErr(taskActionError(e, 'Could not update the task.'));
      return false;
    } finally {
      setBusyIds(s => { const n = new Set(s); n.delete(id); return n; });
    }
  }

  async function deleteTask(id) {
    setBusyIds(s => new Set(s).add(id));
    setErr('');
    try {
      await axios.delete(`/api/tasks/${id}`, { headers });
      setAllTasks(ts => ts.filter(t => t._id !== id));
    } catch (e) {
      console.warn('[InboxTasks] delete failed', e?.response?.data || e);
      setErr(taskActionError(e, 'Could not move the task to Trash.'));
    } finally {
      setBusyIds(s => { const n = new Set(s); n.delete(id); return n; });
    }
  }

  async function toggleDone(id) {
    const currentTask = allTasks.find((task) => task._id === id);
    if (!currentTask) return;
    const desiredCompleted = !currentTask.completed;
    setBusyIds(s => new Set(s).add(id));
    setErr('');
    try {
      const { data } = await axios.patch(`/api/tasks/${id}/toggle`, { completed: desiredCompleted }, { headers });
      setAllTasks(ts => ts.map(t => {
        if (t._id !== id) return t;
        const normalized = data?.task ? normalizeTasks([data.task])[0] : null;
        if (normalized) return { ...t, ...normalized };
        return { ...t, completed: desiredCompleted };
      }));
    } catch (e) {
      console.warn('[InboxTasks] toggle failed', e?.response?.data || e);
      setErr(taskActionError(e, 'Could not update the task status.'));
    } finally {
      setBusyIds(s => { const n = new Set(s); n.delete(id); return n; });
    }
  }

  async function bulkComplete(ids) {
    const idArr = [...ids];
    setErr('');
    try {
      await axios.post('/api/tasks/bulk/complete', { ids: idArr }, { headers });
      // Reload so recurring successors and any partial server reconciliation
      // are represented exactly once.
      await load();
    } catch (e) {
      console.warn('[InboxTasks] bulk complete failed', e?.response?.data || e);
      const partial = e?.response?.data;
      const partialMessage = Number(partial?.modified) > 0 || Number(partial?.successors) > 0
        ? `Some tasks changed (${partial.modified || 0} completed, ${partial.successors || 0} follow-ups). Review the refreshed list.`
        : '';
      await load();
      setErr(partialMessage || taskActionError(e, 'Could not complete the selected tasks.'));
    }
  }

  async function bulkDelete(ids) {
    const idArr = [...ids];
    setErr('');
    try {
      await axios.post('/api/tasks/bulk/delete', { ids: idArr }, { headers });
      setAllTasks(ts => ts.filter(t => !idArr.includes(t._id)));
      setSelected(new Set());
    } catch (e) {
      console.warn('[InboxTasks] bulk delete failed', e?.response?.data || e);
      setErr(taskActionError(e, 'Could not move the selected tasks to Trash.'));
    }
  }

  async function bulkSetDate(ids, dateISO) {
    const results = await Promise.all([...ids].map(id => patch(id, { dueDate: dateISO || null })));
    if (results.every(Boolean)) {
      setSelected(new Set());
      setBulkDate('');
    }
  }

  function startEdit(t) {
    editCancelledRef.current = false;
    setEditId(t._id);
    setEditTitle(t.title);
  }
  function cancelEdit() {
    editCancelledRef.current = true;
    setEditId(null);
  }
  async function commitEdit() {
    if (editCancelledRef.current) {
      editCancelledRef.current = false;
      return;
    }
    const id = editId; const title = editTitle.trim();
    setEditId(null);
    if (!id || !title) return;
    await patch(id, { title });
  }

  return (
    <div className="inbox-page review-page">
      <header className="bar review-page__header">
        <div>
          <h1 className="review-page__title">{routeDate ? `Tasks for ${routeDate}` : 'Tasks'}</h1>
          <p className="review-page__subtitle">
            {routeDate
              ? `Review and add tasks scheduled for ${routeDate}.`
              : 'Review active tasks, due dates, and work captured from entries.'}
          </p>
        </div>
        <div className="review-page__summary">
          <span>{filtered.length} shown</span>
          <span>{allTasks.length} total</span>
        </div>
        <div className="filters">
          <input className="search" value={q} onChange={e=>setQ(e.target.value)} placeholder="Search…" />
          <div className="chips">
            {[
              ...(routeDate ? ['date'] : []),
              'active','today','overdue','upcoming','nodate','fromEntries','completed','all'
            ].map(k => (
              <button type="button" key={k} className={`chip ${scope===k?'on':''}`} onClick={()=>setScope(k)}>
                {k === 'date' ? routeDate : k === 'fromEntries' ? 'From entries' : k === 'nodate' ? 'No date' : k.charAt(0).toUpperCase() + k.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div className="bulk">
          <label className="pill">
            <input type="checkbox" checked={allSelected} onChange={e => setSelectAll(e.target.checked)} />
            <span>Select all</span>
          </label>
          <button type="button" className="review-button review-button--primary" disabled={!anySelected} onClick={()=>bulkComplete(selected)}>Complete</button>
          <button type="button" className="review-button review-button--danger" disabled={!anySelected} onClick={()=>bulkDelete(selected)}>Move selected to Trash</button>
          <input className="date" type="date" value={bulkDate} onChange={e=>setBulkDate(e.target.value)} />
          <button type="button" className="review-button review-button--secondary" disabled={!anySelected} onClick={()=>bulkSetDate(selected, bulkDate || null)}>
            {bulkDate ? 'Set date' : 'Clear date'}
          </button>
          <button type="button" className="review-button review-button--ghost" onClick={()=>{ setSelected(new Set()); load(); }}>Refresh</button>
        </div>
      </header>

      <section className="quickadd">
        <input
          className="new"
          placeholder={routeDate ? `Add a task for ${routeDate}…` : 'Quick add a task…'}
          value={newTitle}
          onChange={e=>setNewTitle(e.target.value)}
          onKeyDown={e=>{ if(e.key==='Enter') { e.preventDefault(); createTask(); } }}
          disabled={creating}
        />
        <button
          type="button"
          className="review-button review-button--primary"
          onClick={createTask}
          disabled={creating || !newTitle.trim()}
        >
          {creating ? 'Adding…' : 'Add'}
        </button>
      </section>

      {loading && <div className="hint">Loading tasks…</div>}
      {!loading && err && <div className="alert error" role="alert">{err}</div>}
      {!loading && filtered.length === 0 && <div className="review-empty">No tasks match this view. Captured tasks will appear here after you create or accept them.</div>}

      {!loading && filtered.length > 0 && (
        <ul className="grid">
          {filtered.map(t => {
            const busy = busyIds.has(t._id);
            const sel = selected.has(t._id);
            const overdue = !t.completed && isISODate(t.dueDate) && t.dueDate < today;
            const recurrence = taskRecurrenceLabel(t);
            return (
              <li key={t._id} className={`card review-card task-card ${t.completed?'done':''} ${overdue?'overdue':''}`}>
                <div className="task-card__top">
                  <div className="title review-card__title task-card__title" onDoubleClick={()=>startEdit(t)}>
                    {editId === t._id ? (
                      <input
                        className="edit"
                        value={editTitle}
                        onChange={e=>setEditTitle(e.target.value)}
                        onBlur={commitEdit}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            e.currentTarget.blur();
                          }
                          if (e.key === 'Escape') {
                            e.preventDefault();
                            cancelEdit();
                          }
                        }}
                        autoFocus
                      />
                    ) : (
                      <span className="text" title="Double-click to edit">{t.title || '(untitled)'}</span>
                    )}
                  </div>

                  <label className="pill task-card__select">
                    <input type="checkbox" checked={sel} onChange={()=>toggleSelect(t._id)} />
                    <span>{sel?'Selected':'Select'}</span>
                  </label>
                </div>

                <div className="meta review-card__meta">
                  <label className="pill">
                    <span>Due</span>
                    <input
                      className="date"
                      type="date"
                      value={t.dueDate || ''}
                      onChange={e=>patch(t._id, { dueDate: e.target.value || null })}
                      disabled={busy}
                    />
                  </label>
                  {t.section ? <span className="review-pill">§ {t.section}</span> : null}
                  {recurrence ? <span className="review-pill">Repeats: {recurrence}</span> : null}
                  {overdue ? <span className="review-pill tag red">overdue</span> : null}
                  {t.completed ? <span className="review-pill tag green">done</span> : null}
                  {t.entryId ? (
                    (typeof t.entryId === 'object' && t.entryId !== null && t.entryId.date) ? (
                      <Link to={`/day/${t.entryId.date}`} className="review-pill clickable-badge" title="Go to source entry date">
                        📄 Entry ({t.entryId.date})
                      </Link>
                    ) : (
                      <span className="review-pill">📄 Source entry</span>
                    )
                  ) : null}
                </div>

                <div className="review-card__actions task-card__actions">
                  <button type="button" className="review-button review-button--primary" disabled={busy} onClick={()=>toggleDone(t._id)}>
                    {t.completed ? 'Reopen' : 'Complete'}
                  </button>
                  <button type="button" className="review-button review-button--ghost" disabled={busy} onClick={()=>startEdit(t)}>
                    Edit
                  </button>
                  <button type="button" className="review-button review-button--ghost task-card__trash" disabled={busy} onClick={()=>deleteTask(t._id)}>
                    Move to Trash
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <style>{`
        .inbox-page { display: grid; gap: .75rem; }
        .bar { display: grid; gap: .5rem; }
        .bar h2 { margin: 0; font-size: 1.15rem; }
        .filters { display: grid; gap: .5rem; grid-template-columns: 1fr auto; align-items: center; }
        .search { padding: .45rem .6rem; border-radius: 10px; border: 1px solid color-mix(in srgb, var(--color-border,#d9c9bc) 78%, transparent); background: color-mix(in srgb, var(--color-surface,#fffaf3) 92%, white 8%); }
        .chips { display: flex; gap: .35rem; flex-wrap: wrap; }
        .chip { border: 1px solid color-mix(in srgb, var(--color-border,#d9c9bc) 78%, transparent); background: color-mix(in srgb, var(--color-surface,#fffaf3) 86%, white 14%); color: var(--color-vein,#5f4b43); padding: .25rem .5rem; border-radius: 999px; cursor: pointer; font-size: .85rem; }
        .chip.on { background: color-mix(in srgb, var(--color-surface,#fffaf3) 66%, var(--color-spool,#6d63c0) 34%); color: var(--color-ink,#1f1512); border-color: color-mix(in srgb, var(--color-spool,#6d63c0) 54%, transparent); }
        .bulk { display: flex; gap: .5rem; flex-wrap: wrap; align-items: center; }
        .pill { display: inline-flex; align-items: center; gap: .35rem; padding: .2rem .45rem; border: 1px solid var(--color-border,#2a2a32); border-radius: 999px; }
        .quickadd { display: flex; gap: .5rem; align-items: center; }
        .new { flex: 1; padding: .5rem .6rem; border-radius: 10px; border: 1px solid color-mix(in srgb, var(--color-border,#d9c9bc) 78%, transparent); background: color-mix(in srgb, var(--color-surface,#fffaf3) 92%, white 8%); }
        .hint { padding: .6rem .75rem; opacity: .8; }
        .error { padding: .6rem .75rem; color: #ff9191; }
        .grid { list-style: none; padding: 0; margin: 0; display: grid; gap: .75rem; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); }
        .card { display: grid; gap: .45rem; padding: .65rem .7rem; border: 1px solid color-mix(in srgb, var(--color-border,#d9c9bc) 76%, transparent); border-radius: 12px; background: linear-gradient(180deg, color-mix(in srgb, var(--color-surface,#fffaf3) 95%, white 5%), var(--color-surface,#fffaf3)); }
        .card.done { opacity: .7; }
        .card.overdue { border-color: color-mix(in srgb, var(--color-danger,#b3261e) 48%, var(--color-border,#d9c9bc) 52%); }
        .task-card { gap: .65rem; padding: .85rem .9rem; }
        .task-card__top { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: .75rem; align-items: start; }
        .task-card__select { font-size: .78rem; opacity: .78; padding: .16rem .42rem; }
        .task-card__title { min-width: 0; font-size: 1.08rem; }
        .task-card__actions {
          justify-content: flex-end;
          padding-top: .55rem;
          border-top: 1px solid color-mix(in srgb, var(--color-border,#2a2a32) 62%, transparent);
        }
        .task-card__actions .review-button {
          padding: .32rem .58rem;
          font-size: .82rem;
        }
        .task-card__trash {
          color: color-mix(in srgb, var(--color-danger,#b42318) 72%, var(--color-muted,#9aa0aa) 28%);
          opacity: .78;
        }
        .task-card__trash:hover,
        .task-card__trash:focus-visible {
          opacity: 1;
          border-color: color-mix(in srgb, var(--color-danger,#b42318) 38%, transparent);
        }
        .row { display: flex; justify-content: space-between; align-items: center; }
        .title { cursor: text; }
        .text { font-weight: 700; overflow-wrap: anywhere; }
        .edit { width: 100%; padding: .35rem .45rem; border-radius: 8px; border: 1px solid color-mix(in srgb, var(--color-border,#d9c9bc) 78%, transparent); background: color-mix(in srgb, var(--color-surface,#fffaf3) 92%, white 8%); }
        .meta { display: flex; gap: .35rem; align-items: center; flex-wrap: wrap; opacity: .88; }
        .meta .pill,
        .meta .review-pill { font-size: .78rem; padding: .16rem .42rem; }
        .date { padding: .2rem .35rem; background: transparent; border: none; color: inherit; outline: none; }
        .tag { font-size: .75rem; padding: .05rem .4rem; border: 1px solid var(--color-border,#2a2a32); border-radius: 999px; color: var(--color-muted,#9aa0aa); }
        .tag.red { color: var(--color-danger,#b3261e); border-color: color-mix(in srgb, var(--color-danger,#b3261e) 34%, transparent); }
        .tag.green { color: var(--color-success,#2f6f4e); border-color: color-mix(in srgb, var(--color-success,#2f6f4e) 34%, transparent); }
        .clickable-badge {
          color: var(--color-primary, #60a5fa);
          border-color: var(--color-primary, #60a5fa);
          text-decoration: none;
          cursor: pointer;
          transition: background 0.2s, color 0.2s;
        }
        .clickable-badge:hover {
          background: rgba(96, 165, 250, 0.1);
        }
        @media (max-width: 720px) {
          .filters {
            grid-template-columns: 1fr;
          }
          .search,
          .new,
          .quickadd .review-button,
          .bulk .review-button,
          .bulk .date {
            width: 100%;
            min-height: 44px;
          }
          .quickadd {
            align-items: stretch;
            flex-direction: column;
          }
          .chips,
          .bulk,
          .meta,
          .task-card__actions {
            align-items: stretch;
          }
          .chip,
          .task-card__actions .review-button {
            min-height: 44px;
          }
          .grid {
            grid-template-columns: 1fr;
          }
          .task-card__top {
            grid-template-columns: 1fr;
          }
          .task-card__select {
            justify-self: start;
            min-height: 40px;
          }
          .task-card__actions {
            justify-content: stretch;
          }
          .task-card__actions .review-button {
            flex: 1 1 9rem;
          }
          .meta .pill {
            max-width: 100%;
          }
        }
      `}</style>
    </div>
  );
}
