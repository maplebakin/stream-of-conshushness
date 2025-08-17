// frontend/src/pages/SectionPage.jsx
import React, { useEffect, useMemo, useState, useContext } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AuthContext } from '../AuthContext.jsx';
import { makeApi } from '../utils/api.js';
import CreateSectionModal from '../components/CreateSectionModal.jsx';
import './SectionPage.css';

/* Toronto date helpers */
function todayISOInToronto(d = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit'
  });
  const parts = fmt.formatToParts(d);
  const y = parts.find(p => p.type === 'year').value;
  const m = parts.find(p => p.type === 'month').value;
  const dd = parts.find(p => p.type === 'day').value;
  return `${y}-${m}-${dd}`;
}
function shiftISO(iso, days) {
  const [Y,M,D] = iso.split('-').map(n => parseInt(n, 10));
  const dt = new Date(Date.UTC(Y, M-1, D, 12, 0, 0));
  dt.setUTCDate(dt.getUTCDate() + days);
  return todayISOInToronto(dt);
}
function humanDate(iso) {
  const [Y,M,D] = iso.split('-').map(n => parseInt(n, 10));
  const dt = new Date(Y, M-1, D);
  return dt.toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' });
}

/* Tiny atoms */
const Spinner = () => <div className="spin" aria-label="Loading" />;
const Empty = ({children}) => <div className="empty">{children}</div>;
const SectionCard = ({title, children, right}) => (
  <section className="section">
    <div className="section-head">
      <h3>{title}</h3>
      {right}
    </div>
    {children}
  </section>
);

export default function SectionPage() {
  const { token } = useContext(AuthContext);
  const api = useMemo(() => makeApi(token), [token]);
  const navigate = useNavigate();
  const { key: routeKey } = useParams();

  const [sections, setSections] = useState([]);
  const [activeKey, setActiveKey] = useState(routeKey || '');
  const [dateISO, setDateISO] = useState(todayISOInToronto());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [opMsg, setOpMsg] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [quickTitle, setQuickTitle] = useState('');

  // load sections
  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const res = await api.get('/api/sections');
        if (ignore) return;
        const list = (res?.data || []).sort((a, b) => {
          if (a.pinned !== b.pinned) return b.pinned - a.pinned;
          if (a.order !== b.order) return a.order - b.order;
          return (a.label || a.key).localeCompare(b.label || b.key);
        });
        setSections(list);
        if (routeKey) setActiveKey(routeKey);
        else if (!activeKey && list.length) {
          setActiveKey(list[0].key);
          navigate(`/sections/${encodeURIComponent(list[0].key)}`, { replace: true });
        }
      } catch (e) { console.error(e); }
    })();
    return () => { ignore = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, routeKey]);

  useEffect(() => { if (routeKey && routeKey !== activeKey) setActiveKey(routeKey); }, [routeKey]); // eslint-disable-line

  // load dashboard data
  useEffect(() => {
    if (!activeKey) return;
    let ignore = false;
    (async () => {
      setLoading(true);
      try {
        const res = await api.get(`/api/sections/${encodeURIComponent(activeKey)}/dashboard?date=${dateISO}`);
        if (ignore) return;
        setData(res?.data || null);
      } catch (e) {
        console.error(e);
        setData(null);
      } finally {
        if (!ignore) setLoading(false);
      }
    })();
    return () => { ignore = true; };
  }, [activeKey, dateISO, api]);

  function note(msg) { setOpMsg(msg); setTimeout(() => setOpMsg(''), 1800); }

  async function carryOver() {
    try {
      await api.post(`/api/sections/${encodeURIComponent(activeKey)}/tasks/carryover?date=${dateISO}`);
      note('Carried over unfinished tasks from yesterday.');
      const res = await api.get(`/api/sections/${encodeURIComponent(activeKey)}/dashboard?date=${dateISO}`);
      setData(res?.data || null);
    } catch (e) { note('Carryover failed.'); console.error(e); }
  }
  async function addToDate(taskId) {
    try {
      await api.post(`/api/sections/${encodeURIComponent(activeKey)}/tasks/${taskId}/add-to-date?date=${dateISO}`);
      const res = await api.get(`/api/sections/${encodeURIComponent(activeKey)}/dashboard?date=${dateISO}`);
      setData(res?.data || null);
    } catch (e) { console.error(e); note('Failed to add.'); }
  }
  async function toggleComplete(task) {
    try {
      await api.put(`/api/tasks/${task._id}`, { completed: !task.completed });
      const res = await api.get(`/api/sections/${encodeURIComponent(activeKey)}/dashboard?date=${dateISO}`);
      setData(res?.data || null);
    } catch (e) { console.error(e); note('Update failed'); }
  }

  // Quick add a task into this section
  async function quickAddTask(e) {
    e?.preventDefault?.();
    const title = (quickTitle || '').trim();
    if (!title) return;
    try {
      await api.post('/api/tasks', { title, sections: [activeKey] });
      setQuickTitle('');
      const res = await api.get(`/api/sections/${encodeURIComponent(activeKey)}/dashboard?date=${dateISO}`);
      setData(res?.data || null);
      note('Task added.');
    } catch (err) { console.error(err); note('Could not add task'); }
  }

  function onCreatedSection(newSection) {
    setSections(prev => {
      const exists = prev.some(c => c.key === newSection.key);
      const next = exists ? prev : [...prev, newSection];
      next.sort((a, b) => {
        if (a.pinned !== b.pinned) return b.pinned - a.pinned;
        if (a.order !== b.order) return a.order - b.order;
        return (a.label || a.key).localeCompare(b.label || b.key);
      });
      return next;
    });
    setActiveKey(newSection.key);
    navigate(`/sections/${encodeURIComponent(newSection.key)}`);
  }

  const activeSection = sections.find(s => s.key === activeKey) || null;

  return (
    <div className="sections-page">
      <aside className="sections-sidebar">
        <div className="sidebar-head">
          <h2>Sections</h2>
          <button className="btn ghost sm" onClick={() => setShowCreate(true)}>+ New</button>
        </div>

        {sections.length === 0 && <Empty>No sections yet. Create one.</Empty>}

        <ul className="section-list">
          {sections.map(s => (
            <li key={s._id} className={`section-item ${activeKey === s.key ? 'active' : ''}`}>
              <Link
                to={`/sections/${encodeURIComponent(s.key)}`}
                className="section-link"
                onClick={() => setActiveKey(s.key)}
              >
                <span className="color-dot" style={{ background: s.color }} />
                <span className="icon">{s.icon || '📚'}</span>
                <span className="label">{s.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </aside>

      <main className="sections-main">
        <header className="sections-header">
          <div className="title">
            <h1>{activeSection ? `${activeSection.icon || '📚'} ${activeSection.label}` : 'Sections'}</h1>
            <div className="subtitle">{humanDate(dateISO)} · {dateISO}</div>
          </div>

          <div className="controls">
            <button className="btn" onClick={() => setDateISO(shiftISO(dateISO, -1))} aria-label="Previous day">‹</button>
            <button className="btn" onClick={() => setDateISO(todayISOInToronto())}>Today</button>
            <button className="btn" onClick={() => setDateISO(shiftISO(dateISO, +1))} aria-label="Next day">›</button>
            <button className="btn ghost" onClick={carryOver} title="Move yesterday's unfinished tasks here to today">Carry over yesterday</button>
          </div>
        </header>

        {opMsg && <div className="toast">{opMsg}</div>}
        {loading && <div className="loading"><Spinner /></div>}

        {!loading && !activeKey && (
          <div className="hero">
            <h2>Create your first section</h2>
            <p>Sections are dashboards for areas like Inbox, Projects, or Learning.</p>
            <button className="btn" onClick={() => setShowCreate(true)}>Create section</button>
          </div>
        )}

        {!loading && data && activeKey && (
          <div className="grid">
            <SectionCard
              title="Today"
              right={
                <form onSubmit={quickAddTask} className="quick-add">
                  <input
                    type="text"
                    placeholder={`Quick add task to ${activeKey}…`}
                    value={quickTitle}
                    onChange={e => setQuickTitle(e.target.value)}
                    aria-label="Quick add task"
                  />
                  <button className="btn sm" type="submit">Add</button>
                </form>
              }
            >
              {data.tasks.today.length === 0 ? (
                <Empty>Nothing scheduled today in this section.</Empty>
              ) : (
                <ul className="task-list">
                  {data.tasks.today.map(t => (
                    <li key={t._id} className={`task ${t.completed ? 'done' : ''}`}>
                      <label className="chk">
                        <input type="checkbox" checked={!!t.completed} onChange={() => toggleComplete(t)} />
                        <span className="checkmark" />
                      </label>
                      <div className="task-main">
                        <div className="task-title">{t.title}</div>
                        {t.notes && <div className="task-notes">{t.notes}</div>}
                      </div>
                      <div className="task-meta">
                        {Array.isArray(t.sections) && t.sections.length > 1 && (
                          <span className="pill">{t.sections.join(' • ')}</span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>

            <SectionCard title="Overdue">
              {data.tasks.overdue.length === 0 ? (
                <Empty>Nothing overdue. Chef’s kiss.</Empty>
              ) : (
                <ul className="task-list">
                  {data.tasks.overdue.map(t => (
                    <li key={t._id} className="task overdue">
                      <label className="chk">
                        <input type="checkbox" checked={!!t.completed} onChange={() => toggleComplete(t)} />
                        <span className="checkmark" />
                      </label>
                      <div className="task-main">
                        <div className="task-title">{t.title}</div>
                        <div className="task-notes small">Due {t.dueDate}</div>
                      </div>
                      <div className="task-actions">
                        <button className="btn sm" onClick={() => addToDate(t._id)}>Add to {dateISO}</button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>

            <SectionCard title="Upcoming">
              {data.tasks.upcoming.length === 0 ? (
                <Empty>Future is wide open.</Empty>
              ) : (
                <ul className="task-list">
                  {data.tasks.upcoming.map(t => (
                    <li key={t._id} className="task">
                      <div className="task-main">
                        <div className="task-title">{t.title}</div>
                        <div className="task-notes small">Due {t.dueDate}</div>
                      </div>
                      <div className="task-actions">
                        <button className="btn sm" onClick={() => addToDate(t._id)}>Add to {dateISO}</button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>

            <SectionCard title="Unscheduled" right={<span className="hint">Click “Add to {dateISO}”.</span>}>
              {data.tasks.unscheduled.length === 0 ? (
                <Empty>No unscheduled tasks here.</Empty>
              ) : (
                <ul className="task-list">
                  {data.tasks.unscheduled.map(t => (
                    <li key={t._id} className="task">
                      <div className="task-main">
                        <div className="task-title">{t.title}</div>
                        {t.notes && <div className="task-notes">{t.notes}</div>}
                      </div>
                      <div className="task-actions">
                        <button className="btn sm" onClick={() => addToDate(t._id)}>Add to {dateISO}</button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>

            <SectionCard title="Recent entries">
              {data.recentEntries.length === 0 ? (
                <Empty>No entries yet for this section.</Empty>
              ) : (
                <ul className="entry-list">
                  {data.recentEntries.map(e => (
                    <li key={e._id} className="entry">
                      <div className="entry-date">{e.date || (e.createdAt || '').slice(0,10)}</div>
                      <div className="entry-text" title={e.text || e.html || ''}>
                        {(e.text || '').slice(0,140) || (e.html || '').replace(/<[^>]+>/g,' ').slice(0,140)}{(e.text && e.text.length>140) ? '…' : ''}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          </div>
        )}
      </main>

      {showCreate && (
        <CreateSectionModal onClose={() => setShowCreate(false)} onCreated={onCreatedSection} />
      )}
    </div>
  );
}
