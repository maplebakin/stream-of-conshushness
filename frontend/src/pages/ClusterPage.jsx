// frontend/src/pages/ClusterPage.jsx
import React, { useEffect, useMemo, useState, useContext } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AuthContext } from '../AuthContext.jsx';
import { makeApi } from '../utils/api.js';
import CreateClusterModal from '../components/CreateClusterModal.jsx';
import './ClusterPage.css';

// Toronto date helpers
function todayISOInToronto(d = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit' });
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
function normalizeClusters(resOrData) {
  const d = resOrData?.data ?? resOrData;
  if (Array.isArray(d)) return d;
  if (Array.isArray(d?.data)) return d.data;
  if (Array.isArray(d?.clusters)) return d.clusters;
  if (Array.isArray(d?.data?.clusters)) return d.data.clusters;
  return [];
}
function normalizeDashboard(resOrData) {
  const d = resOrData?.data ?? resOrData;
  return d?.data ?? d ?? null; // backend: { data: { date, key, tasks:{...}, recentEntries:[] } }
}

// Tiny UI atoms
function Spinner() { return <div className="spin" aria-label="Loading" />; }
function Empty({children}) { return <div className="empty">{children}</div>; }
function Section({title, children, right}) {
  return (
    <section className="section">
      <div className="section-head"><h3>{title}</h3>{right}</div>
      {children}
    </section>
  );
}

export default function ClusterPage() {
  const { token } = useContext(AuthContext);
  const api = useMemo(() => makeApi(token), [token]);
  const navigate = useNavigate();
  const { key: routeKey } = useParams();

  const [clusters, setClusters] = useState([]);
  const [activeKey, setActiveKey] = useState(routeKey || '');
  const [dateISO, setDateISO] = useState(todayISOInToronto());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [opMsg, setOpMsg] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  // load clusters
  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const res = await api.get('/api/clusters');
        if (ignore) return;
        const list = normalizeClusters(res).sort((a, b) => {
          if (a.pinned !== b.pinned) return b.pinned - a.pinned;
          if (a.order !== b.order) return a.order - b.order;
          return (a.label || a.key).localeCompare(b.label || b.key);
        });
        setClusters(list);
        if (routeKey) setActiveKey(routeKey);
        else if (!activeKey && list.length) {
          setActiveKey(list[0].key);
          navigate(`/clusters/${encodeURIComponent(list[0].key)}`, { replace: true });
        }
      } catch (e) {
        console.error(e);
      }
    })();
    return () => { ignore = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, routeKey]);

  useEffect(() => { if (routeKey && routeKey !== activeKey) setActiveKey(routeKey); }, [routeKey]); // eslint-disable-line

  // load dashboard
  useEffect(() => {
    if (!activeKey) return;
    let ignore = false;
    (async () => {
      setLoading(true);
      try {
        const res = await api.get(`/api/clusters/${encodeURIComponent(activeKey)}/dashboard?date=${dateISO}`);
        if (ignore) return;
        setData(normalizeDashboard(res));
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
      await api.post(`/api/clusters/${encodeURIComponent(activeKey)}/tasks/carryover?date=${dateISO}`);
      note('Carried over unfinished tasks from yesterday.');
      const res = await api.get(`/api/clusters/${encodeURIComponent(activeKey)}/dashboard?date=${dateISO}`);
      setData(normalizeDashboard(res));
    } catch (e) {
      note('Carryover failed.'); console.error(e);
    }
  }
  async function addToDate(taskId) {
    try {
      await api.post(`/api/clusters/${encodeURIComponent(activeKey)}/tasks/${taskId}/add-to-date?date=${dateISO}`);
      note('Added to today.');
      const res = await api.get(`/api/clusters/${encodeURIComponent(activeKey)}/dashboard?date=${dateISO}`);
      setData(normalizeDashboard(res));
    } catch (e) {
      note('Failed to add.'); console.error(e);
    }
  }
  async function toggleComplete(task) {
    try {
      await api.patch(`/api/tasks/${task._id}`, { completed: !task.completed });
      const res = await api.get(`/api/clusters/${encodeURIComponent(activeKey)}/dashboard?date=${dateISO}`);
      setData(normalizeDashboard(res));
    } catch (e) {
      console.error(e); note('Update failed');
    }
  }

  function onCreatedCluster(newCluster) {
    setClusters(prev => {
      const exists = prev.some(c => c.key === newCluster.key);
      const next = exists ? prev : [...prev, newCluster];
      next.sort((a, b) => {
        if (a.pinned !== b.pinned) return b.pinned - a.pinned;
        if (a.order !== b.order) return a.order - b.order;
        return (a.label || a.key).localeCompare(b.label || b.key);
      });
      return next;
    });
    setActiveKey(newCluster.key);
    navigate(`/clusters/${encodeURIComponent(newCluster.key)}`);
  }

  const activeCluster = clusters.find(c => c.key === activeKey) || null;

  return (
    <div className="clusters-page">
      <aside className="clusters-sidebar">
        <div className="sidebar-head">
          <h2>Clusters</h2>
          <button className="btn ghost sm" onClick={() => setShowCreate(true)}>+ New</button>
        </div>

        {clusters.length === 0 && <Empty>No clusters yet.<br/>Create your first one.</Empty>}

        <ul className="cluster-list">
          {clusters.map(c => (
            <li key={c._id} className={`cluster-item ${activeKey === c.key ? 'active' : ''}`}>
              <Link to={`/clusters/${encodeURIComponent(c.key)}`} className="cluster-link" onClick={() => setActiveKey(c.key)}>
                <span className="color-dot" style={{ background: c.color }} />
                <span className="icon">{c.icon || '🗂️'}</span>
                <span className="label">{c.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </aside>

      <main className="clusters-main">
        <header className="clusters-header">
          <div className="title">
            <h1>{activeCluster ? `${activeCluster.icon || '🗂️'} ${activeCluster.label}` : 'Clusters'}</h1>
            <div className="subtitle">{humanDate(dateISO)} · {dateISO}</div>
          </div>

          <div className="controls">
            <button className="btn" onClick={() => setDateISO(shiftISO(dateISO, -1))} aria-label="Previous day">‹</button>
            <button className="btn" onClick={() => setDateISO(todayISOInToronto())}>Today</button>
            <button className="btn" onClick={() => setDateISO(shiftISO(dateISO, +1))} aria-label="Next day">›</button>
            <button className="btn ghost" onClick={carryOver} title="Move yesterday's unfinished tasks to today">Carry over yesterday</button>
          </div>
        </header>

        {opMsg && <div className="toast">{opMsg}</div>}
        {loading && <div className="loading"><Spinner /></div>}

        {!loading && !activeKey && (
          <div className="hero">
            <h2>Make your first cluster</h2>
            <p>Clusters are cozy rooms for your life areas. They get their own dashboards and task queues.</p>
            <button className="btn" onClick={() => setShowCreate(true)}>Create cluster</button>
          </div>
        )}

        {!loading && data && activeKey && (
          <div className="grid">
            <Section title="Today">
              {data.tasks.today.length === 0 ? (
                <Empty>Nothing scheduled today for this cluster.</Empty>
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
                        {Array.isArray(t.clusters) && t.clusters.length > 1 && (
                          <span className="pill">{t.clusters.join(' • ')}</span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section title="Overdue">
              {data.tasks.overdue.length === 0 ? (
                <Empty>Clean slate behind you.</Empty>
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
            </Section>

            <Section title="Upcoming">
              {data.tasks.upcoming.length === 0 ? (
                <Empty>Nothing queued. Future you is free.</Empty>
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
            </Section>

            <Section title="Unscheduled" right={<span className="hint">Click “Add to {dateISO}” to pin it.</span>}>
              {data.tasks.unscheduled.length === 0 ? (
                <Empty>No unscheduled tasks in this cluster.</Empty>
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
            </Section>

            <Section title="Recent entries">
              {data.recentEntries.length === 0 ? (
                <Empty>No entries yet for this cluster.</Empty>
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
            </Section>
          </div>
        )}
      </main>

      {showCreate && (
        <CreateClusterModal onClose={() => setShowCreate(false)} onCreated={onCreatedCluster} />
      )}
    </div>
  );
}
