import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from '../api/axiosInstance';
import { todayISOInToronto } from '../utils/date.js';
import './ClusterPage.css'; // optional styles

export default function ClusterPage() {
  const { id } = useParams(); // Mongo _id for the Cluster
  const navigate = useNavigate();

  const [cluster, setCluster] = useState(null);
  const [entries, setEntries] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const today = todayISOInToronto(); // YYYY-MM-DD in America/Toronto

  const openEntry = (entryId, dateISO) => {
    navigate(`/day/${dateISO || today}?focus=${entryId}`);
  };

  async function load() {
    setLoading(true);
    setError('');
    try {
      // 1) Get the cluster (need its name)
      const { data: c } = await axios.get(`/api/clusters/${id}`);
      setCluster(c);

      // 2) Pull entries & tasks by cluster NAME (server expects ?cluster=<name>)
      const [entriesRes, tasksRes] = await Promise.all([
        axios.get(`/api/entries?cluster=${encodeURIComponent(c.name)}`),
        // include overdue tasks with today's view for practical “inbox” effect
        axios.get(`/api/tasks?cluster=${encodeURIComponent(c.name)}&view=today&includeOverdue=1`)
      ]);

      setEntries(Array.isArray(entriesRes.data) ? entriesRes.data : []);
      setTasks(Array.isArray(tasksRes.data) ? tasksRes.data : []);
    } catch (e) {
      console.error(e);
      setError(e?.response?.data?.error || e.message || 'Failed to load cluster');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (id) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleAddToToday(taskId) {
    try {
      setBusy(true);
      // Server supports generic PATCH /api/tasks/:id — set dueDate to today
      await axios.patch(`/api/tasks/${taskId}`, { dueDate: today });
      // refresh tasks list
      await load();
    } catch (e) {
      console.error(e);
      setError(e?.response?.data?.error || 'Failed to move task to today');
    } finally {
      setBusy(false);
    }
  }

  const incompleteTasks = useMemo(
    () => tasks.filter(t => !t.completed),
    [tasks]
  );

  if (loading) {
    return <main className="app-main"><div className="panel">Loading…</div></main>;
  }

  if (error) {
    return (
      <main className="app-main">
        <div className="panel">
          <h2 className="font-thread text-plum">Cluster</h2>
          <p className="text-red-700">{error}</p>
        </div>
      </main>
    );
  }

  if (!cluster) {
    return (
      <main className="app-main">
        <div className="panel">Not found.</div>
      </main>
    );
  }

  return (
    <main className="app-main">
      <section className="section">
        <header className="section-header">
          <h2 className="font-glow text-ink">{cluster.name}</h2>
          <div className="muted">Today: {today}</div>
        </header>

        <div className="grid-two">
          {/* Left: entries */}
          <div className="panel">
            <h3 className="font-thread text-vein">Entries</h3>
            {entries.length === 0 ? (
              <div className="muted">No entries in this cluster yet.</div>
            ) : (
              entries.map(e => (
                <div key={e._id} className="card">
                  <div className="card-title">{e.date}</div>
                  <div className="card-body">{(e.text || e.content || '').slice(0, 200)}</div>
                  <div className="card-actions">
                    <button onClick={() => openEntry(e._id, e.date)} className="btn">
                      Open Day
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Right: tasks */}
          <div className="panel">
            <h3 className="font-thread text-vein">Tasks (today + overdue)</h3>
            {incompleteTasks.length === 0 ? (
              <div className="muted">Nothing here. Clean slate ✨</div>
            ) : (
              incompleteTasks.map(t => (
                <div key={t._id} className="card">
                  <div className="card-title">{t.title}</div>
                  {t.details && <div className="card-body muted">{t.details}</div>}
                  <div className="card-meta muted">
                    Due: {t.dueDate || '—'} {Array.isArray(t.clusters) && t.clusters.length > 0 && (
                      <> • Clusters: {t.clusters.join(', ')}</>
                    )}
                  </div>
                  <div className="card-actions">
                    {!t.dueDate && (
                      <button
                        onClick={() => handleAddToToday(t._id)}
                        className="btn"
                        disabled={busy}
                      >
                        ➕ Add to Today
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
