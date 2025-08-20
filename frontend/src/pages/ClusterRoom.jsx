// frontend/src/pages/ClusterRoom.jsx
import React, { useEffect, useMemo, useState, useContext } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from '../api/axiosInstance';
import { AuthContext } from '../AuthContext.jsx';
import RoomLayout from '../components/room/RoomLayout.jsx';
import '../Main.css';

/* -------------------------- Toronto date helpers -------------------------- */
function torontoParts(d = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const p = fmt.formatToParts(d);
  const y = p.find(x => x.type === 'year').value;
  const m = p.find(x => x.type === 'month').value;
  const dd = p.find(x => x.type === 'day').value;
  return { y, m, dd };
}
function torontoTodayISO() {
  const { y, m, dd } = torontoParts();
  return `${y}-${m}-${dd}`;
}
function parseISODateLocalMidnight(iso) {
  const [y, m, d] = iso.split('-').map(n => parseInt(n, 10));
  return new Date(y, m - 1, d);
}
function toTorontoISOFromDate(d) {
  const { y, m, dd } = torontoParts(d);
  return `${y}-${m}-${dd}`;
}

/* -------------------------- Timeline builder -------------------------- */
function buildTimeline({ entries, tasks, appts }, filters) {
  const items = [];

  if (filters.entries && Array.isArray(entries)) {
    for (const e of entries) {
      items.push({
        type: 'entry',
        id: e._id,
        timelineDate: e.createdAt || e.date || '1970-01-01',
        data: e
      });
    }
  }
  if (filters.tasks && Array.isArray(tasks)) {
    for (const t of tasks) {
      const tl = t.dueDate || t.createdAt || '1970-01-01';
      items.push({ type: 'task', id: t._id, timelineDate: tl, data: t });
    }
  }
  if (filters.appts && Array.isArray(appts)) {
    for (const a of appts) {
      const tl = a.start || a.date || '1970-01-01';
      items.push({ type: 'appt', id: a._id, timelineDate: tl, data: a });
    }
  }

  items.sort((a, b) => (a.timelineDate > b.timelineDate ? -1 : a.timelineDate < b.timelineDate ? 1 : 0));
  return items;
}

/* -------------------------- Simple UI atoms --------------------------- */
function PillButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`pill ${active ? '' : 'pill-muted'}`}
      style={{ cursor: 'pointer', border: 'none', background: 'transparent' }}
      aria-pressed={!!active}
    >
      {children}
    </button>
  );
}
function EntryCard({ e }) {
  return (
    <article className="entry-card" key={e._id} style={{ paddingTop: 8 }}>
      <div className="entry-meta">
        <span className="date">{e.date}</span>
        {e.mood && <span className="pill">{e.mood}</span>}
        {Array.isArray(e.tags) &&
          e.tags.slice(0, 5).map((t, i) => (
            <span key={i} className="pill pill-muted">#{t}</span>
          ))}
      </div>
      <div className="entry-text">
        {e.text || (e.html ? <span dangerouslySetInnerHTML={{ __html: e.html }} /> : '—')}
      </div>
    </article>
  );
}
function TaskCard({ t }) {
  return (
    <article className="entry-card" key={t._id}>
      <div className="entry-meta">
        <span className="pill">Task</span>
        {t.dueDate ? <span className="pill">{t.dueDate}</span> : <span className="pill pill-muted">no date</span>}
      </div>
      <div>{t.title}</div>
    </article>
  );
}
function ApptCard({ a }) {
  const when = a.start ? new Date(a.start).toLocaleString() : (a.date || '—');
  return (
    <article className="entry-card" key={a._id}>
      <div className="entry-meta">
        <span className="pill">Appointment</span>
        <span className="pill">{when}</span>
      </div>
      <div>{a.title}</div>
    </article>
  );
}

/* =============================== Page =============================== */
export default function ClusterRoom() {
  const { clusterSlug } = useParams();
  const { token } = useContext(AuthContext);

  // Left spine
  const [clusters, setClusters] = useState([]);
  // Center feed data
  const [entries, setEntries] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [appts, setAppts] = useState([]);
  // Right panel slices
  const [tasksToday, setTasksToday] = useState([]);
  const [tasksUpcoming, setTasksUpcoming] = useState([]);
  const [apptsToday, setApptsToday] = useState([]);
  const [apptsUpcoming, setApptsUpcoming] = useState([]);
  // Motifs (tags/mood)
  const [motifs, setMotifs] = useState({ tags: [], moods: [] });

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [composing, setComposing] = useState(false);
  const [newText, setNewText] = useState('');

  // Pagination for entries
  const [page, setPage] = useState(0);
  const limit = 50;
  const [hasMore, setHasMore] = useState(false);

  // Filter toggles for center feed (entries default on)
  const [filters, setFilters] = useState({ entries: true, tasks: false, appts: false, notes: false });

  const title = (clusterSlug || '').replace(/-/g, ' ');

  useEffect(() => {
    if (!token || !clusterSlug) return;

    // reset on cluster change
    setEntries([]);
    setPage(0);
    setHasMore(false);
    setLoading(true);
    setErrorMsg('');

    const controller = new AbortController();
    const headers = { Authorization: `Bearer ${token}` };
    const signal = controller.signal;

    (async () => {
      try {
        // 1) Left spine clusters
        let spine = [];
        try {
          const sec = await axios.get('/api/sections?type=cluster', { headers, signal });
          spine = Array.isArray(sec.data)
            ? sec.data.map(s => ({
                slug: s.slug || (s.name || '').toLowerCase(),
                name: s.name || s.title || s.slug || 'Unnamed',
                emoji: s.emoji || ''
              }))
            : [];
        } catch {
          spine = [{ slug: clusterSlug, name: title, emoji: '' }];
        }
        if (!signal.aborted) setClusters(spine);

        // 2) Entries page 0
        const entryRes = await axios.get(
          `/api/entries?cluster=${encodeURIComponent(clusterSlug)}&limit=${limit}&offset=0`,
          { headers, signal }
        );
        const entriesData = Array.isArray(entryRes.data) ? entryRes.data : [];
        if (!signal.aborted) {
          setEntries(entriesData);
          setHasMore(entriesData.length === limit);
        }

        // 3) Tasks + Appointments
        let tasksData = [];
        try {
          const tRes = await axios.get(
            `/api/tasks?cluster=${encodeURIComponent(clusterSlug)}&completed=false&limit=200`,
            { headers, signal }
          );
          tasksData = Array.isArray(tRes.data) ? tRes.data : [];
        } catch { tasksData = []; }
        if (!signal.aborted) setTasks(tasksData);

        let apptsData = [];
        try {
          const aRes = await axios.get(
            `/api/appointments?cluster=${encodeURIComponent(clusterSlug)}&limit=200`,
            { headers, signal }
          );
          apptsData = Array.isArray(aRes.data) ? aRes.data : [];
        } catch { apptsData = []; }
        if (!signal.aborted) setAppts(apptsData);

        // 4) Compute Today / Up next (Toronto)
        const today = torontoTodayISO();

        const tToday = tasksData.filter(t => t.dueDate === today);
        const tUpcoming = tasksData
          .filter(t => t.dueDate && t.dueDate > today)
          .sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0))
          .slice(0, 5);

        const aToday = apptsData.filter(a => {
          if (!a.start && !a.date) return false;
          const dt = a.start ? new Date(a.start) : parseISODateLocalMidnight(a.date);
          return toTorontoISOFromDate(dt) === today;
        });
        const aUpcoming = apptsData
          .filter(a => {
            const dt = a.start ? new Date(a.start) : (a.date ? parseISODateLocalMidnight(a.date) : null);
            return dt && toTorontoISOFromDate(dt) > today;
          })
          .sort((a, b) => {
            const ad = a.start ? a.start : (a.date || '');
            const bd = b.start ? b.start : (b.date || '');
            return ad < bd ? -1 : ad > bd ? 1 : 0;
          })
          .slice(0, 5);

        if (!signal.aborted) {
          setTasksToday(tToday);
          setTasksUpcoming(tUpcoming);
          setApptsToday(aToday);
          setApptsUpcoming(aUpcoming);
        }

        // 5) Motifs from last 30 days of entries
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const recent = entriesData.filter(e => {
          const created = e.createdAt ? new Date(e.createdAt) : parseISODateLocalMidnight(e.date);
          return created >= thirtyDaysAgo;
        });
        const tagCounts = {};
        const moodCounts = {};
        for (const e of recent) {
          if (Array.isArray(e.tags)) e.tags.forEach(t => (tagCounts[t] = (tagCounts[t] || 0) + 1));
          if (e.mood) moodCounts[e.mood] = (moodCounts[e.mood] || 0) + 1;
        }
        const topTags = Object.entries(tagCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8)
          .map(([tag, count]) => ({ tag, count }));
        const topMoods = Object.entries(moodCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([mood, count]) => ({ mood, count }));
        if (!signal.aborted) setMotifs({ tags: topTags, moods: topMoods });
      } catch (e) {
        if (!controller.signal.aborted) {
          console.warn('ClusterRoom load failed:', e?.response?.data || e.message);
          setErrorMsg('Failed to load room data. Try again.');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [token, clusterSlug]);

  async function handleAddEntry(e) {
    e.preventDefault();
    if (!newText.trim()) return;
    try {
      setComposing(true);
      const resp = await axios.post(
        '/api/entries',
        { text: newText, cluster: clusterSlug },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setNewText('');
      setEntries(prev => [resp.data, ...prev]);
    } catch (err) {
      console.warn('Add entry failed:', err?.response?.data || err.message);
    } finally {
      setComposing(false);
    }
  }

  async function loadMoreEntries() {
    try {
      const nextPage = page + 1;
      const offset = nextPage * limit;
      const res = await axios.get(
        `/api/entries?cluster=${encodeURIComponent(clusterSlug)}&limit=${limit}&offset=${offset}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const batch = Array.isArray(res.data) ? res.data : [];
      setEntries(prev => [...prev, ...batch]);
      setPage(nextPage);
      setHasMore(batch.length === limit);
    } catch (e) {
      console.warn('Load more failed:', e?.response?.data || e.message);
    }
  }

  const timeline = useMemo(
    () => buildTimeline({ entries, tasks, appts }, filters),
    [entries, tasks, appts, filters]
  );

  /* ------------- left / center / right slots (fed into RoomLayout) ------------- */
  const leftSlot = (
    <>
      <h3 style={{ marginTop: 0 }}>Clusters</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {clusters.length === 0 && <span className="muted">No clusters found.</span>}
        {clusters.map(c => {
          const active = c.slug === clusterSlug;
          return (
            <Link
              key={c.slug}
              to={`/clusters/${c.slug}`}
              className={`px-3 py-2 rounded-button ${active ? 'bg-plum text-mist' : 'text-ink hover:bg-thread hover:text-mist'}`}
              style={{ textTransform: 'capitalize' }}
            >
              {c.emoji ? `${c.emoji} ` : ''}{c.name}
            </Link>
          );
        })}
      </div>
    </>
  );

  const centerSlot = (
    <>
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="section-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <h2 style={{ margin: 0, textTransform: 'capitalize' }}>{title}</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <PillButton active={filters.entries} onClick={() => setFilters(f => ({ ...f, entries: !f.entries }))}>Entries</PillButton>
            <PillButton active={filters.tasks} onClick={() => setFilters(f => ({ ...f, tasks: !f.tasks }))}>Tasks</PillButton>
            <PillButton active={filters.appts} onClick={() => setFilters(f => ({ ...f, appts: !f.appts }))}>Appointments</PillButton>
          </div>
        </div>

        <form onSubmit={handleAddEntry} style={{ marginTop: 12 }}>
          <textarea
            className="input"
            placeholder={`New entry in ${title}…`}
            value={newText}
            onChange={e => setNewText(e.target.value)}
            rows={3}
            style={{ width: '100%' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 8 }}>
            {errorMsg ? <span className="muted">{errorMsg}</span> : <span />}
            <button type="submit" className="button" disabled={composing || !newText.trim()}>
              {composing ? 'Saving…' : 'Add Entry'}
            </button>
          </div>
        </form>
      </div>

      <div className="card">
        {loading ? (
          <div>Loading…</div>
        ) : timeline.length === 0 ? (
          <div className="muted">This room is quiet. Start with an entry above.</div>
        ) : (
          <>
            {timeline.map(item => {
              if (item.type === 'entry') return <EntryCard key={`e-${item.id}`} e={item.data} />;
              if (item.type === 'task') return <TaskCard key={`t-${item.id}`} t={item.data} />;
              if (item.type === 'appt') return <ApptCard key={`a-${item.id}`} a={item.data} />;
              return null;
            })}
            {hasMore && (
              <div style={{ display: 'flex', justifyContent: 'center', marginTop: 12 }}>
                <button className="button" onClick={loadMoreEntries}>Load more</button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );

  const rightSlot = (
    <>
      <h3 style={{ marginTop: 0 }}>Today in {title}</h3>
      {tasksToday.length === 0 && apptsToday.length === 0 ? (
        <p className="muted">Nothing due today.</p>
      ) : (
        <>
          {tasksToday.length > 0 && (
            <>
              <div className="muted" style={{ marginTop: 6 }}>Tasks</div>
              <ul className="unstyled">
                {tasksToday.map(t => <li key={t._id}>• {t.title}</li>)}
              </ul>
            </>
          )}
          {apptsToday.length > 0 && (
            <>
              <div className="muted" style={{ marginTop: 6 }}>Appointments</div>
              <ul className="unstyled">
                {apptsToday.map(a => {
                  const time = a.start
                    ? new Date(a.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    : (a.date || '');
                  return <li key={a._id}>• {a.title} {time && <span className="pill pill-muted">{time}</span>}</li>;
                })}
              </ul>
            </>
          )}
        </>
      )}

      <h3>Up next</h3>
      {tasksUpcoming.length === 0 && apptsUpcoming.length === 0 ? (
        <p className="muted">No upcoming items.</p>
      ) : (
        <>
          {tasksUpcoming.length > 0 && (
            <>
              <div className="muted" style={{ marginTop: 6 }}>Tasks</div>
              <ul className="unstyled">
                {tasksUpcoming.map(t => <li key={t._id}>• {t.title} <span className="pill pill-muted">{t.dueDate}</span></li>)}
              </ul>
            </>
          )}
          {apptsUpcoming.length > 0 && (
            <>
              <div className="muted" style={{ marginTop: 6 }}>Appointments</div>
              <ul className="unstyled">
                {apptsUpcoming.map(a => {
                  const when = a.start ? new Date(a.start).toLocaleDateString() : (a.date || '');
                  return <li key={a._id}>• {a.title} <span className="pill pill-muted">{when}</span></li>;
                })}
              </ul>
            </>
          )}
        </>
      )}

      <h3>Recent motifs</h3>
      {motifs.tags.length === 0 && motifs.moods.length === 0 ? (
        <p className="muted">No trends yet.</p>
      ) : (
        <>
          {motifs.tags.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div className="muted">Top tags</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                {motifs.tags.map(({ tag, count }) => (
                  <span key={tag} className="pill pill-muted">#{tag} ×{count}</span>
                ))}
              </div>
            </div>
          )}
          {motifs.moods.length > 0 && (
            <div>
              <div className="muted">Top moods</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                {motifs.moods.map(({ mood, count }) => (
                  <span key={mood} className="pill">{mood} ×{count}</span>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </>
  );

  return (
    <RoomLayout title={title} left={leftSlot} right={rightSlot}>
      {centerSlot}
    </RoomLayout>
  );
}
