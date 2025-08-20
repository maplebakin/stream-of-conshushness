// frontend/src/MainPage.jsx
import React, { useEffect, useState, useContext, useMemo, useCallback, Suspense } from 'react';
import EntryModal from './EntryModal.jsx';
import axios from './api/axiosInstance';
import './Main.css';
import './streampage.css';
import toast from 'react-hot-toast';
import { AuthContext } from './AuthContext.jsx';
import { getLocalTodayISO, toDisplayDate } from './utils/date.js';

/* ---------- Robust sort helpers so newest stay on top across reloads ---------- */
const parseDayMs = (v) => {
  if (!v) return -Infinity;
  if (v instanceof Date) {
    return new Date(v.getFullYear(), v.getMonth(), v.getDate()).getTime();
  }
  if (typeof v === 'string') {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]).getTime();
    const t = new Date(v).getTime();
    return Number.isNaN(t) ? -Infinity : t;
  }
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? -Infinity : t;
};

const createdAtMs = (e) => {
  if (e?.createdAt) {
    const t = new Date(e.createdAt).getTime();
    if (!Number.isNaN(t)) return t;
  }
  if (e?._id && typeof e._id === 'string' && e._id.length >= 8) {
    const secs = parseInt(e._id.slice(0, 8), 16);
    if (!Number.isNaN(secs)) return secs * 1000;
  }
  return -Infinity;
};

const stableSortEntriesDesc = (arr) =>
  [...arr].sort((a, b) => {
    const dayA = parseDayMs(a.date);
    const dayB = parseDayMs(b.date);
    if (dayA !== dayB) return dayB - dayA; // newer day first
    const ca = createdAtMs(a);
    const cb = createdAtMs(b);
    if (ca !== cb) return cb - ca; // newer created first
    if (a._id && b._id && a._id !== b._id) return a._id < b._id ? 1 : -1;
    return 0;
  });

/* ---------- Normalize for legacy fields (content/html/text) ---------- */
const normalizeEntry = (e) => {
  const html =
    e.html ??
    (typeof e.content === 'string' && /<[^>]+>/.test(e.content) ? e.content : '');

  const text =
    e.text ??
    (typeof (html || e.content) === 'string'
      ? String(html || e.content).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
      : '');

  return { ...e, html, text };
};

export default function MainPage() {
  const { token, isAuthenticated, logout } = useContext(AuthContext);

  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  // quick filters
  const [query, setQuery] = useState('');
  const [clusterFilter, setClusterFilter] = useState('all');

  const fetchEntries = useCallback(async () => {
    if (!token) {
      setEntries([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await axios.get('/api/entries');
      const list = Array.isArray(res.data) ? res.data : [];
      const normalized = list.map(normalizeEntry);
      setEntries(stableSortEntriesDesc(normalized));
    } catch (err) {
      console.error('⚠️ Error fetching entries:', err);
      if (err?.response?.status === 401) {
        toast.error('Session expired. Please log in again.');
        logout?.();
      } else {
        toast.error('Failed to load entries');
      }
    } finally {
      setLoading(false);
    }
  }, [token, logout]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const handleDelete = async (id) => {
    try {
      await axios.delete(`/api/entries/${id}`);
      setEntries((prev) => prev.filter((e) => e._id !== id));
      toast.success('Entry deleted');
    } catch (err) {
      console.error('delete error:', err);
      toast.error('Could not delete entry');
    }
  };

  const handleSaved = (newEntryRaw) => {
    const newEntry = normalizeEntry(newEntryRaw);
    setEntries((prev) => stableSortEntriesDesc([newEntry, ...prev]));
    setShowModal(false);
  };

  const clusters = useMemo(() => {
    const setVals = new Set();
    entries.forEach((e) => e.cluster && setVals.add(e.cluster));
    const rest = Array.from(setVals).sort((a, b) => a.localeCompare(b));
    return ['all', ...rest];
  }, [entries]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((e) => {
      const passesCluster = clusterFilter === 'all' || e.cluster === clusterFilter;
      const passesQuery =
        !q ||
        (e.text && e.text.toLowerCase().includes(q)) ||
        (typeof e.content === 'string' && e.content.toLowerCase().includes(q)) ||
        (Array.isArray(e.tags) && e.tags.some((t) => String(t).toLowerCase().includes(q))) ||
        (e.mood && String(e.mood).toLowerCase().includes(q));
      return passesCluster && passesQuery;
    });
  }, [entries, query, clusterFilter]);

  const todayISO = getLocalTodayISO?.() || new Date().toISOString().slice(0, 10);

  return (
    <main className="stream-page">
      {/* Header */}
      <section className="stream-header">
        <div className="stream-title">
          <h1 className="font-echo text-plum text-3xl">Stream</h1>
        </div>

        <div className="stream-controls">
          <div className="today-chip font-glow text-vein" title="Local date">
            {toDisplayDate?.(todayISO) || todayISO}
          </div>

          <input
            type="search"
            className="search-input font-glow"
            placeholder="Search text, tags, mood…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />

          <select
            className="cluster-select font-thread"
            value={clusterFilter}
            onChange={(e) => setClusterFilter(e.target.value)}
          >
            {clusters.map((c) => (
              <option key={c} value={c}>
                {c === 'all' ? 'All Clusters' : c}
              </option>
            ))}
          </select>

          <button
            type="button"
            className="add-entry-btn bg-lantern text-ink rounded-button px-4 py-2 font-thread shadow-soft hover:bg-plum hover:text-mist transition-all"
            onClick={() => setShowModal(true)}
            disabled={!isAuthenticated}
            title={isAuthenticated ? 'New Entry' : 'Log in to add entries'}
          >
            + New Entry
          </button>
        </div>
      </section>

      {/* Body */}
      <section className="entry-feed">
        {loading && <div className="loading font-glow text-vein">Loading entries…</div>}

        {!loading && filtered.length === 0 && (
          <div className="empty-state">
            <p className="font-glow text-vein">
              {query || clusterFilter !== 'all'
                ? 'No entries match your filters.'
                : 'No entries yet. Wanna start a ripple?'}
            </p>
            <button
              type="button"
              className="add-entry-btn bg-plum text-mist rounded-button px-4 py-2 font-thread shadow-soft hover:bg-lantern hover:text-ink transition-all"
              onClick={() => setShowModal(true)}
              disabled={!isAuthenticated}
            >
              {query || clusterFilter !== 'all' ? 'Clear filters' : 'Write first entry'}
            </button>
          </div>
        )}

        {!loading &&
          filtered.map((entry) => (
            <article className="entry-card" key={entry._id || createdAtMs(entry)}>
              <div className="entry-meta">
                <span className="date font-glow text-vein">
                  {toDisplayDate?.(entry.date) || entry.date}
                </span>
                {entry.cluster && <span className="cluster-chip">{entry.cluster}</span>}
                {Array.isArray(entry.tags) && entry.tags.length > 0 && (
                  <span className="tags">
                    {entry.tags.map((t) => (
                      <span className="tag" key={String(t)}>#{t}</span>
                    ))}
                  </span>
                )}
                {entry.suggestedTasks?.length > 0 && (
                  <span className="ripple-indicator" title="Suggested tasks found">💡</span>
                )}
              </div>

              <div
                className="entry-text"
                dangerouslySetInnerHTML={{
                  __html:
                    (entry.html && entry.html.length)
                      ? entry.html
                      : (typeof entry.content === 'string' && /<[^>]+>/.test(entry.content))
                        ? entry.content
                        : (entry.text ?? '').replaceAll('\n', '<br/>')
                }}
              />

              <div className="entry-actions">
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => handleDelete(entry._id)}
                  title="Delete"
                >
                  🗑️
                </button>
              </div>
            </article>
          ))}
      </section>

      {/* Modal */}
      <Suspense fallback={null}>
        {showModal && (
          <EntryModal
            onClose={() => setShowModal(false)}
            onSaved={handleSaved}
            defaultCluster={clusterFilter !== 'all' ? clusterFilter : ''}
            defaultTags={[]}
          />
        )}
      </Suspense>
    </main>
  );
}
