// frontend/src/MainPage.jsx
import React, { useEffect, useState, useContext, useMemo, useCallback, useRef, Suspense } from 'react';
import { Link } from 'react-router-dom';
import EntryModal from './EntryModal.jsx';
import axios from './api/axiosInstance';
import './Main.css';
import './streampage.css';
import toast from 'react-hot-toast';
import { AuthContext } from './AuthContext.jsx';
import { getLocalTodayISO, toDisplayDate } from './utils/date.js';
import SafeHTML from './components/SafeHTML.jsx'; // (top of file)
import RecentActivityWidget from './components/RecentActivityWidget.jsx';
import { confirmAndTrashEntry } from './utils/entryDeletion.js';

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
  const [quickEntryText, setQuickEntryText] = useState('');
  const [recentActivityOpen, setRecentActivityOpen] = useState(false);
  const quickEntryRef = useRef(null);

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

  const todayISO = getLocalTodayISO?.() || new Date().toISOString().slice(0, 10);

  const handleDelete = async (entry) => {
    try {
      const result = await confirmAndTrashEntry({
        entry,
        confirmDelete: window.confirm.bind(window),
        deleteRequest: (id) => axios.delete(`/api/entries/${id}`),
        onDeleted: (id) => {
          setEntries((prev) => prev.filter((e) => e._id !== id));
        },
      });

      if (result.deleted) {
        toast.success('Entry moved to trash');
      }
    } catch (err) {
      console.error('delete error:', err);
      toast.error('Could not move entry to trash');
    }
  };

  const handleSaved = (newEntryRaw) => {
    const newEntry = normalizeEntry(newEntryRaw);
    setEntries((prev) => stableSortEntriesDesc([newEntry, ...prev]));
    setShowModal(false);
  };

  const autoResizeQuickEntry = useCallback(() => {
    const el = quickEntryRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  const resetQuickEntry = useCallback(() => {
    setQuickEntryText('');
    const el = quickEntryRef.current;
    if (!el) return;
    el.style.height = 'auto';
  }, []);

  const submitQuickEntry = useCallback(async () => {
    const text = quickEntryText.trim();
    if (!text || !isAuthenticated) return;

    try {
      const res = await axios.post('/api/entries', { text, date: todayISO });
      const created = normalizeEntry(res.data || {});
      setEntries((prev) => [created, ...prev]);
      resetQuickEntry();
    } catch (err) {
      console.error('quick entry create error:', err);
      toast.error('Could not create entry');
    }
  }, [quickEntryText, isAuthenticated, todayISO, resetQuickEntry]);

  const clusters = useMemo(() => {
    const seen = new Map();
    entries.forEach((e) => {
      if (Array.isArray(e.clusters)) {
        e.clusters.forEach((c) => {
          const slug = c?.slug || (typeof c === 'string' ? c : null);
          const name = c?.name || slug;
          if (slug && !seen.has(slug)) seen.set(slug, name);
        });
      } else if (e.cluster) {
        if (!seen.has(e.cluster)) seen.set(e.cluster, e.cluster);
      }
    });
    const rest = Array.from(seen.entries())
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([slug]) => slug);
    return ['all', ...rest];
  }, [entries]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((e) => {
      const passesCluster =
        clusterFilter === 'all' ||
        (Array.isArray(e.clusters)
          ? e.clusters.some((c) => (c?.slug || c) === clusterFilter)
          : e.cluster === clusterFilter);
      const passesQuery =
        !q ||
        (e.text && e.text.toLowerCase().includes(q)) ||
        (typeof e.content === 'string' && e.content.toLowerCase().includes(q)) ||
        (Array.isArray(e.tags) && e.tags.some((t) => String(t).toLowerCase().includes(q))) ||
        (e.mood && String(e.mood).toLowerCase().includes(q));
      return passesCluster && passesQuery;
    });
  }, [entries, query, clusterFilter]);

  return (
    <main className="stream-page">
      {/* Header */}
      <section className="stream-header">
        <div className="stream-title">
          <h1 className="font-echo text-plum text-3xl">Stream</h1>
        </div>

        <div className="stream-controls">
          <div
            className="today-chip font-glow text-vein"
            title="Local date"
            aria-live="polite"
          >
            {toDisplayDate?.(todayISO) || todayISO}
          </div>

          <input
            type="search"
            className="search-input font-glow"
            placeholder="Search text, tags, mood…"
            aria-label="Search entries"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />

          <select
            className="cluster-select font-thread"
            value={clusterFilter}
            onChange={(e) => setClusterFilter(e.target.value)}
            aria-label="Filter entries by cluster"
          >
            {clusters.map((c) => (
              <option key={c} value={c}>
                {c === 'all' ? 'All Clusters' : c}
              </option>
            ))}
          </select>


        </div>
      </section>

      {/* Recent Activity Widget */}
      <section className="recent-activity-collapsible">
        <button
          type="button"
          className="recent-activity-toggle"
          onClick={() => setRecentActivityOpen((v) => !v)}
          aria-expanded={recentActivityOpen}
        >
          {recentActivityOpen ? '▾' : '▸'} Recent Activity
        </button>
        {recentActivityOpen && <RecentActivityWidget />}
      </section>

      {/* Body */}
      <section className="entry-feed">
        <form
          className="quick-entry quick-entry--primary"
          onSubmit={(e) => {
            e.preventDefault();
            submitQuickEntry();
          }}
        >
          <textarea
            ref={quickEntryRef}
            rows={1}
            className="quick-entry-input"
            placeholder="Capture a thought, task, idea, appointment, or thing to remember..."
            value={quickEntryText}
            onChange={(e) => setQuickEntryText(e.target.value)}
            onInput={autoResizeQuickEntry}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                submitQuickEntry();
              }
            }}
            disabled={!isAuthenticated}
          />
          <p className="quick-entry-help">Enter for a new line. Ctrl+Enter to capture.</p>
          <button
            type="submit"
            className="quick-entry-send"
            disabled={!isAuthenticated || !quickEntryText.trim()}
            title="Create entry"
            aria-label="Create entry"
          >
            Save to Stream
          </button>
        </form>

        <nav className="stream-review-links" aria-label="Review captured items">
          <span>Review captured threads</span>
          <Link to="/inbox/tasks">Tasks</Link>
          <Link to="/ripples">Ripples</Link>
          <Link to="/gather-lists">Gather</Link>
          <Link to="/interests">Interests</Link>
        </nav>

        <section className="stream-onboarding-card" aria-labelledby="stream-onboarding-title">
          <div className="stream-onboarding-copy">
            <h2 id="stream-onboarding-title">Write naturally. Structure appears after.</h2>
            <p>
              Capture the thought first. StreamofConshushness can turn useful pieces into
              Gather Lists, Sparks & Interests, Tasks, or things On the Horizon without
              making you sort everything upfront.
            </p>
            <p className="stream-onboarding-helper">
              You do not have to know what kind of entry it is before you write it.
            </p>
          </div>

          <div className="stream-onboarding-examples" aria-label="Example entries">
            <span>"I need to get milk" <strong>Grocery List</strong></span>
            <span>"I have a doctor's appointment at 3pm on June 25th" <strong>On the Horizon</strong></span>
            <span>"I'd like to learn about tap dance" <strong>Sparks & Interests</strong></span>
            <span>"I'm nervous about my appointment" <strong>Entry only</strong></span>
          </div>
        </section>

        <div className="stream-feed-header">
          <h2>Recent entries</h2>
          <span>{filtered.length} shown</span>
        </div>

        {loading && (
          <div className="loading font-glow text-vein" role="status" aria-live="polite">
            Loading entries…
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="empty-state" role="status" aria-live="polite">
            <p className="font-glow text-vein">
              {query || clusterFilter !== 'all'
                ? 'No entries match your filters.'
                : 'No entries yet. Wanna start a ripple?'}
            </p>
            <button
              type="button"
              className="add-entry-btn bg-plum text-mist rounded-button font-thread shadow-soft hover:bg-lantern hover:text-ink px-4 py-2 transition-all"
              onClick={() => {
                if (query || clusterFilter !== 'all') {
                  setQuery('');
                  setClusterFilter('all');
                } else {
                  setShowModal(true);
                }
              }}
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
                {entry.clusters && entry.clusters.length > 0 && entry.clusters[0]?.slug ? (
                  <Link
                    to={`/clusters/${entry.clusters[0].slug}`}
                    className="cluster-chip"
                    style={{ textDecoration: 'none', color: 'inherit' }}
                    title={`View cluster: ${entry.clusters[0].name}`}
                  >
                    {entry.clusters[0].icon && `${entry.clusters[0].icon} `}{entry.clusters[0].name}
                  </Link>
                ) : entry.cluster ? (
                  <span className="cluster-chip">{entry.cluster}</span>
                ) : null}
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




<SafeHTML
  className="entry-text"
  html={
    (entry?.html && entry.html.length)
      ? entry.html
      : (typeof entry?.content === 'string' && /<[^>]+>/.test(entry.content))
        ? entry.content
        : (entry?.text ?? '').replaceAll('\n', '<br/>')
  }
/>

              <div className="entry-actions">
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => handleDelete(entry)}
                  title="Move to trash"
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
