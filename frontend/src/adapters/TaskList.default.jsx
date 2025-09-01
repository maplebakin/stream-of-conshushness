import React, { useContext, useEffect, useMemo, useState } from 'react';
import axios from '../api/axiosInstance';
import { AuthContext } from '../AuthContext.jsx';

export default function TaskList({ date, header = "Today’s Tasks" }) {
  const { token } = useContext(AuthContext);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const headers = useMemo(() => (token ? { Authorization: `Bearer ${token}` } : {}), [token]);

  useEffect(() => {
    let cancelled = false;

    async function fetchTasks() {
      setLoading(true);
      try {
        // Try common variants; keep whichever works first.
        let data = [];
        try {
          const r = await axios.get(`/api/tasks?date=${encodeURIComponent(date)}&limit=300&includeCompleted=1`, { headers });
          data = Array.isArray(r.data) ? r.data : (r.data?.data || []);
        } catch {
          try {
            const r = await axios.get(`/api/tasks/day/${encodeURIComponent(date)}`, { headers });
            data = Array.isArray(r.data) ? r.data : (r.data?.tasks || []);
          } catch {
            const r = await axios.get(`/api/tasks?dueDate=${encodeURIComponent(date)}&limit=300&includeCompleted=1`, { headers });
            data = Array.isArray(r.data) ? r.data : (r.data?.data || []);
          }
        }

        // Mild normalization
        const norm = (data || []).map(t => ({
          _id: t._id || t.id,
          title: t.title || '(untitled)',
          notes: t.notes || '',
          dueDate: t.dueDate || '',
          completed: !!t.completed,
          clusters: Array.isArray(t.clusters) ? t.clusters : (t.cluster ? [t.cluster] : []),
          priority: Number.isFinite(t.priority) ? t.priority : 0,
        }));

        if (!cancelled) setTasks(norm);
      } catch (e) {
        if (!cancelled) setTasks([]);
        console.warn('[TaskList] fetch failed', e?.response?.data || e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    if (token && date) fetchTasks();
    return () => { cancelled = true; };
  }, [token, date, headers]);

// frontend/src/adapters/TaskList.default.jsx — toggle function
async function toggleDone(task) {
  const prev = tasks;
  const nextList = tasks.map(t => t._id === task._id ? { ...t, completed: !t.completed } : t);
  setTasks(nextList);

  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  // helper — *only used* on fallback when server doesn't spawn
  function localSpawnIfNeeded() {
    if (!task.rrule || !task.dueDate || task.completed) return; // only on first completion
    const nextDue = nextFromRRule(task.rrule, task.dueDate);    // same helper logic as server (daily/weekly/monthly)
    if (!nextDue) return;
    const clone = {
      title: task.title,
      notes: task.notes || '',
      rrule: task.rrule || '',
      clusters: task.clusters || [],
      sections: task.sections || [],
      dueDate: nextDue,
      priority: task.priority || 0,
    };
    return axios.post('/api/tasks', clone, { headers });
  }

  try {
    // Preferred: backend route that also spawns next
    const resp = await axios.patch(`/api/tasks/${task._id}/toggle`, {}, { headers });
    const spawned = resp?.data?.next;
    if (spawned) {
      // If next due is visible today on this list, insert it
      setTasks(cur => {
        const already = cur.some(t => t._id === spawned._id);
        return already ? cur : [...cur, spawned];
      });
    }
  } catch {
    try {
      // Fallback: just update completed; then spawn locally if needed
      await axios.patch(`/api/tasks/${task._id}`, { completed: !task.completed }, { headers });
      await localSpawnIfNeeded();
    } catch (e2) {
      setTasks(prev); // revert on error
      console.warn('[TaskList] toggle failed', e2?.response?.data || e2.message);
      alert('Could not update task.');
    }
  }
}



  return (
    <div className="card">
      <div className="section-header" style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
        <h3 className="font-thread text-vein" style={{ margin: 0 }}>{header}</h3>
        <span className="muted" style={{ fontSize: '.9rem' }}>{date}</span>
      </div>

      {loading && <div className="muted">Loading tasks…</div>}
      {!loading && tasks.length === 0 && <div className="muted">No tasks for this day.</div>}

      {!loading && tasks.length > 0 && (
        <ul className="task-list" style={{ listStyle:'none', padding:0, margin:0, display:'grid', gap:8 }}>
          {tasks.map(t => (
            <li
              key={t._id}
              className={`task-row ${t.completed ? 'is-completed' : ''}`}
              style={{ display:'grid', gridTemplateColumns:'auto 1fr auto', alignItems:'start', gap:10, padding:'10px 12px', border:'1px solid var(--border, #e6e6ea)', borderRadius:10, background:'var(--card, #fff)' }}
            >
              <label style={{ display:'flex', alignItems:'flex-start', gap:10, cursor:'pointer' }}>
                <input
                  type="checkbox"
                  checked={t.completed}
                  onChange={() => toggleDone(t)}
                  aria-label={t.completed ? 'Mark task incomplete' : 'Mark task complete'}
                />
              </label>

              <div className="task-main" style={{ minWidth: 0 }}>
                <div className={`task-title ${t.completed ? 'line' : ''}`} style={{ fontWeight:600, wordBreak:'break-word' }}>
                  {t.title}
                </div>
                {t.notes && (
                  <div className={`task-notes ${t.completed ? 'muted' : ''}`} style={{ fontSize:'.92rem', marginTop:4, opacity:t.completed ? .6 : .9 }}>
                    {t.notes}
                  </div>
                )}
                <div className="task-meta" style={{ display:'flex', gap:6, flexWrap:'wrap', marginTop:6 }}>
                  {t.dueDate && <span className="pill pill-muted">due {t.dueDate}</span>}
                  {t.clusters?.length > 0 && <span className="pill">{t.clusters.join(' • ')}</span>}
                </div>
              </div>

              {/* right-side spacer / future actions */}
              <div />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
