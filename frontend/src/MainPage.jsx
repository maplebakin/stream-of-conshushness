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
import ReviewInboxSummary from './components/ReviewInboxSummary.jsx';
import { confirmAndTrashEntry, getEntryTrashConfirmationMessage } from './utils/entryDeletion.js';
import { useReviewCount } from './hooks/useReviewCount.js';
import {
  clearStreamDraft,
  createClientRequestId,
  draftIdentityAfterTextChange,
  readStreamDraft,
  streamDraftKey,
  writeStreamDraft,
} from './utils/streamDraft.js';
import { requestErrorSummary } from './utils/requestError.js';
import { CalmEmptyState, CompactPageHeader, SecondarySection } from './components/UXPrimitives.jsx';

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

const STREAM_TUTORIAL_DISMISSED_KEY = 'streamTutorialDismissed';

const getStreamTutorialDismissed = () => {
  try {
    return window.localStorage?.getItem(STREAM_TUTORIAL_DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
};

const saveStreamTutorialDismissed = () => {
  try {
    window.localStorage?.setItem(STREAM_TUTORIAL_DISMISSED_KEY, '1');
  } catch {
    // If storage is unavailable, the current session still hides it.
  }
};

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
  const { token, user, isAuthenticated, logout } = useContext(AuthContext);

  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);

  // quick filters
  const [query, setQuery] = useState('');
  const [clusterFilter, setClusterFilter] = useState('all');
  const [quickEntryText, setQuickEntryText] = useState('');
  const [quickEntrySaving, setQuickEntrySaving] = useState(false);
  const [quickEntryError, setQuickEntryError] = useState('');
  const [quickDraftRecovered, setQuickDraftRecovered] = useState(false);
  const [streamTutorialDismissed, setStreamTutorialDismissed] = useState(getStreamTutorialDismissed);
  const [confirmingEntryDeleteId, setConfirmingEntryDeleteId] = useState('');
  const [reviewRefreshKey, setReviewRefreshKey] = useState(0);
  const quickEntryRef = useRef(null);
  const quickEntrySubmittingRef = useRef(false);
  const quickEntryRequestIdRef = useRef('');
  const quickEntrySubmittedTextRef = useRef('');
  const quickEntryDateRef = useRef('');
  const entriesRequestSequenceRef = useRef(0);
  const currentOwnerRef = useRef('');
  const reviewCount = useReviewCount(Boolean(token), reviewRefreshKey);
  const quickDraftKey = streamDraftKey(user);
  const ownerId = String(user?.userId || user?._id || user?.id || '').trim();
  currentOwnerRef.current = ownerId;

  const fetchEntries = useCallback(async () => {
    const sequence = ++entriesRequestSequenceRef.current;
    const requestOwnerId = ownerId;
    if (!token) {
      setEntries([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await axios.get('/api/entries');
      if (sequence !== entriesRequestSequenceRef.current || requestOwnerId !== currentOwnerRef.current) return;
      const list = Array.isArray(res.data) ? res.data : [];
      const normalized = list.map(normalizeEntry);
      setEntries(stableSortEntriesDesc(normalized));
    } catch (err) {
      if (sequence !== entriesRequestSequenceRef.current || requestOwnerId !== currentOwnerRef.current) return;
      console.error('⚠️ Error fetching entries:', requestErrorSummary(err));
      if (err?.response?.status === 401) {
        toast.error('Session expired. Please log in again.');
        logout?.();
      } else {
        toast.error('Failed to load entries');
      }
    } finally {
      if (sequence === entriesRequestSequenceRef.current && requestOwnerId === currentOwnerRef.current) {
        setLoading(false);
      }
    }
  }, [token, logout, ownerId]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const todayISO = getLocalTodayISO?.() || new Date().toISOString().slice(0, 10);

  useEffect(() => {
    let storage = null;
    try {
      storage = window.localStorage;
    } catch {
      // Capture still works when browser storage is unavailable.
    }

    const draft = readStreamDraft(storage, quickDraftKey);
    const text = draft?.text || '';
    const requestId = draft?.clientRequestId || (text ? createClientRequestId() : '');
    const draftDate = draft?.date || todayISO;

    quickEntryRequestIdRef.current = requestId;
    quickEntrySubmittedTextRef.current = draft?.submittedText || '';
    quickEntryDateRef.current = draftDate;
    setQuickEntryText(text);
    setQuickDraftRecovered(Boolean(text));
    setQuickEntryError('');

    if (text && !draft?.clientRequestId) {
      writeStreamDraft(storage, quickDraftKey, {
        text,
        date: draftDate,
        clientRequestId: requestId,
        submittedText: draft?.submittedText || '',
      });
    }
  }, [quickDraftKey, todayISO]);

  const handleDelete = async (entry) => {
    if (confirmingEntryDeleteId !== entry?._id) {
      setConfirmingEntryDeleteId(entry?._id || '');
      return;
    }

    try {
      const result = await confirmAndTrashEntry({
        entry,
        confirmDelete: () => true,
        deleteRequest: (id) => axios.delete(`/api/entries/${id}`),
        onDeleted: (id) => {
          setEntries((prev) => prev.filter((e) => e._id !== id));
        },
      });

      if (result.deleted) {
        setConfirmingEntryDeleteId('');
        toast.success('Entry moved to trash');
      }
    } catch (err) {
      console.error('delete error:', requestErrorSummary(err));
      toast.error('Could not move entry to trash');
    }
  };

  const handleSaved = (newEntryRaw) => {
    const newEntry = normalizeEntry(newEntryRaw);
    setEntries((prev) => stableSortEntriesDesc([
      newEntry,
      ...prev.filter((entry) => entry._id !== newEntry._id),
    ]));
    setShowModal(false);
    setEditingEntry(null);
    setReviewRefreshKey((key) => key + 1);
  };

  const openNewEntry = useCallback(() => {
    setEditingEntry(null);
    setShowModal(true);
  }, []);

  const openEditEntry = useCallback((entry) => {
    setEditingEntry(entry);
    setShowModal(true);
  }, []);

  const autoResizeQuickEntry = useCallback(() => {
    const el = quickEntryRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  useEffect(() => {
    const animationFrame = requestAnimationFrame(autoResizeQuickEntry);
    return () => cancelAnimationFrame(animationFrame);
  }, [autoResizeQuickEntry, quickEntryText]);

  const resetQuickEntry = useCallback(() => {
    setQuickEntryText('');
    setQuickDraftRecovered(false);
    const el = quickEntryRef.current;
    if (!el) return;
    el.style.height = 'auto';
  }, []);

  const persistQuickDraft = useCallback((text, {
    requestId = quickEntryRequestIdRef.current,
    submittedText = quickEntrySubmittedTextRef.current,
    date = quickEntryDateRef.current || todayISO,
  } = {}) => {
    let storage = null;
    try {
      storage = window.localStorage;
    } catch {
      return false;
    }

    return writeStreamDraft(storage, quickDraftKey, {
      text,
      date,
      clientRequestId: requestId,
      submittedText,
    });
  }, [quickDraftKey, todayISO]);

  const handleQuickEntryChange = useCallback((value) => {
    if (!value) {
      quickEntryRequestIdRef.current = '';
      quickEntrySubmittedTextRef.current = '';
      quickEntryDateRef.current = todayISO;
      setQuickEntryText('');
      setQuickDraftRecovered(false);
      setQuickEntryError('');
      let storage = null;
      try {
        storage = window.localStorage;
      } catch {
        // Nothing to clear when storage is unavailable.
      }
      clearStreamDraft(storage, quickDraftKey);
      return;
    }

    const identity = draftIdentityAfterTextChange({
      clientRequestId: quickEntryRequestIdRef.current,
      submittedText: quickEntrySubmittedTextRef.current,
      nextText: value,
    });
    if (!quickEntryRequestIdRef.current || identity.clientRequestId !== quickEntryRequestIdRef.current) {
      quickEntryDateRef.current = todayISO;
    }
    quickEntryRequestIdRef.current = identity.clientRequestId;
    quickEntrySubmittedTextRef.current = identity.submittedText;
    setQuickEntryText(value);
    setQuickDraftRecovered(false);
    setQuickEntryError('');
    persistQuickDraft(value, {
      requestId: identity.clientRequestId,
      submittedText: identity.submittedText,
      date: quickEntryDateRef.current,
    });
  }, [persistQuickDraft, quickDraftKey, todayISO]);

  const submitQuickEntry = useCallback(async () => {
    const text = quickEntryText.trim();
    if (!text || !isAuthenticated || quickEntrySubmittingRef.current) return;

    const requestId = quickEntryRequestIdRef.current || createClientRequestId();
    const entryDate = quickEntryDateRef.current || todayISO;
    quickEntryRequestIdRef.current = requestId;
    quickEntrySubmittedTextRef.current = text;
    quickEntryDateRef.current = entryDate;
    persistQuickDraft(quickEntryText, { requestId, submittedText: text, date: entryDate });

    quickEntrySubmittingRef.current = true;
    setQuickEntrySaving(true);
    setQuickEntryError('');

    try {
      const res = await axios.post('/api/entries', {
        text,
        date: entryDate,
        clientRequestId: requestId,
      });
      const created = normalizeEntry(res.data || {});
      setEntries((prev) => stableSortEntriesDesc([
        created,
        ...prev.filter((entry) => entry._id !== created._id),
      ]));
      setReviewRefreshKey((key) => key + 1);
      let storage = null;
      try {
        storage = window.localStorage;
      } catch {
        // The in-memory draft can still be cleared.
      }
      clearStreamDraft(storage, quickDraftKey);
      quickEntryRequestIdRef.current = '';
      quickEntrySubmittedTextRef.current = '';
      quickEntryDateRef.current = todayISO;
      resetQuickEntry();
    } catch (err) {
      console.error('quick entry create error:', requestErrorSummary(err));
      setQuickEntryError('Could not save yet. Your draft is still here; retry when you are ready.');
      toast.error('Could not create entry');
    } finally {
      quickEntrySubmittingRef.current = false;
      setQuickEntrySaving(false);
    }
  }, [quickEntryText, isAuthenticated, todayISO, persistQuickDraft, quickDraftKey, resetQuickEntry]);

  const dismissStreamTutorial = useCallback(() => {
    setStreamTutorialDismissed(true);
    saveStreamTutorialDismissed();
  }, []);

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
      <CompactPageHeader
        eyebrow={toDisplayDate?.(todayISO) || todayISO}
        title="Stream"
        description="Drop the thought here. You can sort it out later."
      />

      <section className="entry-feed">
        <form
          className="quick-entry quick-entry--primary"
          aria-busy={quickEntrySaving}
          onSubmit={(e) => {
            e.preventDefault();
            submitQuickEntry();
          }}
        >
          <textarea
            ref={quickEntryRef}
            rows={1}
            className="quick-entry-input"
            placeholder="Capture a thought, task, or reminder…"
            value={quickEntryText}
            onChange={(e) => handleQuickEntryChange(e.target.value)}
            onInput={autoResizeQuickEntry}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                submitQuickEntry();
              }
            }}
            disabled={!isAuthenticated || quickEntrySaving}
            aria-describedby="quick-entry-status"
          />
          <p
            id="quick-entry-status"
            className={`quick-entry-help${quickEntryError ? ' quick-entry-help--error' : ''}`}
            role={quickEntryError ? 'alert' : 'status'}
            aria-live="polite"
          >
            {quickEntrySaving
              ? 'Saving to Stream…'
              : quickEntryError || (quickDraftRecovered
                ? 'Recovered your unfinished draft. Ctrl+Enter to capture.'
                : 'Enter for a new line. Ctrl+Enter to capture.')}
          </p>
          <button
            type="submit"
            className="quick-entry-send"
            disabled={!isAuthenticated || !quickEntryText.trim() || quickEntrySaving}
            title="Create entry"
            aria-label="Create entry"
          >
            {quickEntrySaving ? 'Catching it…' : 'Capture thought'}
          </button>
        </form>

        <ReviewInboxSummary className="stream-review-summary" counts={reviewCount.counts} total={reviewCount.count} />

        <SecondarySection
          summary="Recent activity"
          hint="Changes across your space"
          className="stream-activity"
        >
          <RecentActivityWidget />
        </SecondarySection>

        {!streamTutorialDismissed && !loading && entries.length === 0 && (
          <section className="stream-onboarding-card" aria-labelledby="stream-onboarding-title">
            <div className="stream-onboarding-header">
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
              <button
                type="button"
                className="stream-onboarding-dismiss"
                onClick={dismissStreamTutorial}
                aria-label="Hide Stream helper card"
              >
                Got it
              </button>
            </div>

          </section>
        )}

        <SecondarySection
          summary="Find or filter entries"
          hint={query || clusterFilter !== 'all' ? 'Filters active' : 'Optional'}
          className="stream-filter-disclosure"
        >
          <div className="stream-controls">
            <input
              type="search"
              className="search-input font-glow"
              placeholder="Search your entries…"
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
                <option key={c} value={c}>{c === 'all' ? 'Every cluster' : c}</option>
              ))}
            </select>
          </div>
        </SecondarySection>

        <div className="stream-feed-header">
          <h2>Recent entries</h2>
          {(query || clusterFilter !== 'all') && <span>{filtered.length} found</span>}
        </div>

        {loading && (
          <div className="loading font-glow text-vein" role="status" aria-live="polite">
            Loading entries…
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <CalmEmptyState
            title={query || clusterFilter !== 'all' ? 'No matching threads' : 'Your Stream is ready'}
            action={<button
              type="button"
              className="button"
              onClick={() => {
                if (query || clusterFilter !== 'all') {
                  setQuery('');
                  setClusterFilter('all');
                } else {
                  openNewEntry();
                }
              }}
              disabled={!isAuthenticated}
            >
              {query || clusterFilter !== 'all' ? 'Clear filters' : 'Write your first thought'}
            </button>}
          >
            {query || clusterFilter !== 'all'
              ? 'Try another phrase or return to all entries.'
              : 'Start with whatever is taking up space in your head.'}
          </CalmEmptyState>
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
                  className="icon-btn icon-btn--text"
                  onClick={() => openEditEntry(entry)}
                  aria-label={`Edit entry from ${entry.date || 'the Stream'}`}
                  title="Edit entry"
                >
                  Edit
                </button>
                <button
                  type="button"
                  className={`icon-btn${confirmingEntryDeleteId === entry._id ? ' icon-btn--confirm' : ''}`}
                  onClick={() => handleDelete(entry)}
                  aria-label={confirmingEntryDeleteId === entry._id ? 'Confirm moving entry to trash' : 'Move entry to trash'}
                  title={confirmingEntryDeleteId === entry._id ? getEntryTrashConfirmationMessage(entry) : 'Move to trash'}
                >
                  {confirmingEntryDeleteId === entry._id ? 'Confirm' : '🗑️'}
                </button>
                {confirmingEntryDeleteId === entry._id && (
                  <button
                    type="button"
                    className="icon-btn icon-btn--confirm"
                    onClick={() => setConfirmingEntryDeleteId('')}
                    title="Cancel"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </article>
          ))}

      </section>

      {/* Modal */}
      <Suspense fallback={null}>
        {showModal && (
          <EntryModal
            initialEntry={editingEntry}
            onClose={() => {
              setShowModal(false);
              setEditingEntry(null);
            }}
            onSaved={handleSaved}
            defaultCluster={!editingEntry && clusterFilter !== 'all' ? clusterFilter : ''}
            defaultTags={[]}
          />
        )}
      </Suspense>
    </main>
  );
}
