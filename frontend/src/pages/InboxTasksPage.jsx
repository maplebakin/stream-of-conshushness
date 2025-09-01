import React, { useContext, useEffect, useMemo, useState } from 'react';
import axios from '../api/axiosInstance';
import { AuthContext } from '../AuthContext.jsx';

/* ——— Toronto day helpers ——— */
function todayISOInToronto(d = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year:'numeric', month:'2-digit', day:'2-digit' });
  const parts = Object.fromEntries(fmt.formatToParts(d).map(p => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
const isISO = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const cmpDate = (a, b) => new Date(a).setHours(0,0,0,0) - new Date(b).setHours(0,0,0,0);

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
    createdAt: t.createdAt, updatedAt: t.updatedAt,
  })).filter(t => t._id);
}

export default function InboxTasksPage() {
  const headers = useAuthHeaders();
  const [allTasks, setAllTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [scope, setScope] = useState('active'); // active | all | overdue | today | upcoming | nodate
  const [selected, setSelected] = useState(() => new Set());
  const [busyIds, setBusyIds] = useState(() => new Set());
  const [newTitle, setNewTitle] = useState('');
  const [bulkDate, setBulkDate] = useState('');
  const [editId, setEditId] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const today = todayISOInToronto();

  async function load() {
    setLoading(true); setErr('');
    try {
      const res = await axios.get('/api/tasks', { headers });
      setAllTasks(normalizeTasks(res));
    } catch (e) {
      console.error('[InboxTasks] load failed', e?.response?.data || e);
      setErr(e?.response?.data?.error || 'Failed to load tasks.');
      setAllTasks([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const filtered = useMemo(() => {
    const text = q.trim().toLowerCase();
    return allTasks.filter(t => {
      const matchQ = !text || t.title.toLowerCase().includes(text);
      if (!matchQ) return false;
      if (scope === 'all') return true;
      if (scope === 'active' && t.completed) return false;
      if (scope === 'overdue') return !t.completed && isISO(t.dueDate) && cmpDate(t.dueDate, today) < 0;
      if (scope === 'today') return !t.completed && t.dueDate === today;
      if (scope === 'upcoming') return !t.completed && isISO(t.dueDate) && cmpDate(t.dueDate, today) > 0;
      if (scope === 'nodate') return !t.completed && !t.dueDate;
      return true;
    }).sort((a,b) => {
      // prioritize active + date asc + createdAt
      const ac = (a.completed?1:0) - (b.completed?1:0);
      if (ac !== 0) return ac;
      const ad = isISO(a.dueDate) ? a.dueDate : '9999-12-31';
      const bd = isISO(b.dueDate) ? b.dueDate : '9999-12-31';
      if (ad !== bd) return ad < bd ? -1 : 1;
      return (a.createdAt || '').localeCompare(b.createdAt || '');
    });
  }, [allTasks, q, scope, today]);

  const allSelected = selected.size > 0 && filtered.every(t => selected.has(t._id));
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
    const title = newTitle.trim();
    if (!title) return;
    try {
      const { data } = await axios.post('/api/tasks', { title }, { headers });
      setAllTasks(ts => [{ _id: data._id || data.id, title: data.title || title, completed: !!data.completed, dueDate: data.dueDate || null, section: data.section || '' }, ...ts]);
      setNewTitle('');
    } catch (e) {
      console.warn('[InboxTasks] create failed', e?.response?.data || e);
    }
  }

  async function patch(id, body) {
    setBusyIds(s => new Set(s).add(id));
    try {
      const { data } = await axios.patch(`/api/tasks/${id}`, body, { headers });
      setAllTasks(ts => ts.map(t => t._id === id ? { ...t, ...normalizeTasks([data])[0] } : t));
    } catch (e) {
      console.warn('[InboxTasks] patch failed', e?.response?.data || e);
    } finally {
      setBusyIds(s => { const n = new Set(s); n.delete(id); return n; });
    }
  }

  async function toggleDone(id) {
    setBusyIds(s => new Set(s).add(id));
    try {
      const { data } = await axios.patch(`/api/tasks/${id}/toggle`, null, { headers });
      setAllTasks(ts => ts.map(t => t._id === id ? { ...t, completed: data?.completed ?? !t.completed } : t));
    } catch (e) {
      console.warn('[InboxTasks] toggle failed', e?.response?.data || e);
    } finally {
      setBusyIds(s => { const n = new Set(s); n.delete(id); return n; });
    }
  }

  async function bulkComplete(ids) {
    for (const id of ids) await toggleDone(id);
    setSelected(new Set());
  }
  async function bulkSetDate(ids, dateISO) {
    for (const id of ids) await patch(id, { dueDate: dateISO || null });
    setSelected(new Set());
    setBulkDate('');
  }

  function startEdit(t) { setEditId(t._id); setEditTitle(t.title); }
  async function commitEdit() {
    const id = editId; const title = editTitle.trim();
    setEditId(null);
    if (!id || !title) return;
    await patch(id, { title });
  }

  return (
    <div className="inbox-page">
      <header className="bar">
        <h2>Active Task Workbench</h2>
        <div className="filters">
          <input className="search" value={q} onChange={e=>setQ(e.target.value)} placeholder="Search…" />
          <div className="chips">
            {['active','today','overdue','upcoming','nodate','all'].map(k => (
              <button key={k} className={`chip ${scope===k?'on':''}`} onClick={()=>setScope(k)}>{k}</button>
            ))}
          </div>
        </div>
        <div className="bulk">
          <label className="pill">
            <input type="checkbox" checked={allSelected} onChange={e => setSelectAll(e.target.checked)} />
            <span>Select all</span>
          </label>
          <button className="btn" disabled={!anySelected} onClick={()=>bulkComplete(selected)}>Complete</button>
          <input className="date" type="date" value={bulkDate} onChange={e=>setBulkDate(e.target.value)} />
          <button className="btn" disabled={!anySelected} onClick={()=>bulkSetDate(selected, bulkDate || null)}>
            {bulkDate ? 'Set date' : 'Clear date'}
          </button>
          <button className="btn ghost" onClick={load}>Refresh</button>
        </div>
      </header>

      <section className="quickadd">
        <input
          className="new"
          placeholder="Quick add a task…"
          value={newTitle}
          onChange={e=>setNewTitle(e.target.value)}
          onKeyDown={e=>{ if(e.key==='Enter') createTask(); }}
        />
        <button className="btn" onClick={createTask}>Add</button>
      </section>

      {loading && <div className="hint">Loading tasks…</div>}
      {!loading && err && <div className="error">{err}</div>}
      {!loading && !err && filtered.length === 0 && <div className="hint">No tasks match. Serene surface.</div>}

      {!loading && !err && filtered.length > 0 && (
        <ul className="grid">
          {filtered.map(t => {
            const busy = busyIds.has(t._id);
            const sel = selected.has(t._id);
            const overdue = !t.completed && isISO(t.dueDate) && cmpDate(t.dueDate, today) < 0;
            return (
              <li key={t._id} className={`card ${t.completed?'done':''} ${overdue?'overdue':''}`}>
                <div className="row">
                  <label className="pill">
                    <input type="checkbox" checked={sel} onChange={()=>toggleSelect(t._id)} />
                    <span>{sel?'Selected':'Select'}</span>
                  </label>
                  <button className="btn ghost" disabled={busy} onClick={()=>toggleDone(t._id)}>
                    {t.completed ? '↺ Reopen' : '✓ Complete'}
                  </button>
                </div>

                <div className="title" onDoubleClick={()=>startEdit(t)}>
                  {editId === t._id ? (
                    <input
                      className="edit"
                      value={editTitle}
                      onChange={e=>setEditTitle(e.target.value)}
                      onBlur={commitEdit}
                      onKeyDown={e=>{ if(e.key==='Enter') commitEdit(); if(e.key==='Escape') setEditId(null); }}
                      autoFocus
                    />
                  ) : (
                    <span className="text" title="Double-click to edit">{t.title || '(untitled)'}</span>
                  )}
                </div>

                <div className="meta">
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
                  {t.section ? <span className="tag">§ {t.section}</span> : null}
                  {overdue ? <span className="tag red">overdue</span> : null}
                  {t.completed ? <span className="tag green">done</span> : null}
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
        .search { padding: .45rem .6rem; border-radius: 10px; border: 1px solid var(--color-border,#2a2a32); background: rgba(255,255,255,.02); }
        .chips { display: flex; gap: .35rem; flex-wrap: wrap; }
        .chip { border: 1px solid var(--color-border,#2a2a32); background: transparent; color: inherit; padding: .25rem .5rem; border-radius: 999px; cursor: pointer; font-size: .85rem; }
        .chip.on { background: rgba(255,255,255,.06); }
        .bulk { display: flex; gap: .5rem; flex-wrap: wrap; align-items: center; }
        .pill { display: inline-flex; align-items: center; gap: .35rem; padding: .2rem .45rem; border: 1px solid var(--color-border,#2a2a32); border-radius: 999px; }
        .btn { border: 1px solid var(--color-border,#2a2a32); background: transparent; color: inherit; padding: .25rem .6rem; border-radius: 8px; cursor: pointer; }
        .btn.ghost { opacity: .8; }
        .quickadd { display: flex; gap: .5rem; align-items: center; }
        .new { flex: 1; padding: .5rem .6rem; border-radius: 10px; border: 1px solid var(--color-border,#2a2a32); background: rgba(255,255,255,.02); }
        .hint { padding: .6rem .75rem; opacity: .8; }
        .error { padding: .6rem .75rem; color: #ff9191; }
        .grid { list-style: none; padding: 0; margin: 0; display: grid; gap: .6rem; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); }
        .card { display: grid; gap: .45rem; padding: .65rem .7rem; border: 1px solid var(--color-border,#2a2a32); border-radius: 12px; background: rgba(255,255,255,.02); }
        .card.done { opacity: .7; }
        .card.overdue { border-color: #ff9191; }
        .row { display: flex; justify-content: space-between; align-items: center; }
        .title { cursor: text; }
        .text { font-weight: 600; }
        .edit { width: 100%; padding: .35rem .45rem; border-radius: 8px; border: 1px solid var(--color-border,#2a2a32); background: rgba(255,255,255,.05); }
        .meta { display: flex; gap: .4rem; align-items: center; flex-wrap: wrap; }
        .date { padding: .2rem .35rem; background: transparent; border: none; color: inherit; outline: none; }
        .tag { font-size: .75rem; padding: .05rem .4rem; border: 1px solid var(--color-border,#2a2a32); border-radius: 999px; color: var(--color-muted,#9aa0aa); }
        .tag.red { color: #ff9191; }
        .tag.green { color: #8fe3a2; }
      `}</style>
    </div>
  );
}
