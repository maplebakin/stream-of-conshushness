// frontend/src/pages/SectionPage.jsx
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useState, useEffect, useContext, useMemo, useCallback, useRef } from 'react';
import axios from '../api/axiosInstance.js';
import { AuthContext } from '../AuthContext.jsx';
import TaskList from '../adapters/TaskList.default.jsx';
import '../Main.css';
import SafeHTML from '../components/SafeHTML.jsx';
import './SectionPage.css';

const VIEW_TABS = [
  { key: 'entries', label: 'Entries' },
  { key: 'pages', label: 'Pages' },
];

const PAGE_SIZE = 25;

const DEFAULT_FILTERS = Object.freeze({
  startDate: '',
  endDate: '',
  tag: '',
  mood: '',
});

function renderEntryHtml(entry) {
  if (entry?.html && entry.html.trim()) return entry.html;
  if (typeof entry?.content === 'string' && /<[^>]+>/.test(entry.content)) return entry.content;
  return (entry?.text ?? '').replace(/\n/g, '<br/>');
}

function formatEntryTimestamp(entry) {
  const iso = entry?.updatedAt || entry?.createdAt;
  if (!iso) return '';
  try {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch (err) {
    console.warn('formatEntryTimestamp failed:', err);
    return '';
  }
}

export default function SectionPage() {
  const navigate = useNavigate();
  const params = useParams();
  const routeKey = (params.key || params.sectionName || '').toLowerCase();

  const { token } = useContext(AuthContext);

  const [entries, setEntries] = useState([]);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [entriesLoadingMore, setEntriesLoadingMore] = useState(false);
  const [entriesHasMore, setEntriesHasMore] = useState(true);
  const [entriesError, setEntriesError] = useState('');
  const [filters, setFilters] = useState(() => ({ ...DEFAULT_FILTERS }));
  const [copiedEntryId, setCopiedEntryId] = useState('');
  const [pinningIds, setPinningIds] = useState(() => new Set());
  const [pages, setPages] = useState([]);
  const [allSections, setAllSections] = useState([]);
  const [loadingSections, setLoadingSections] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState('');
  const [activePane, setActivePane] = useState('entries');
  const [activeKey, setActiveKey] = useState(routeKey);

  const sentinelRef = useRef(null);
  const copyTimeoutRef = useRef(null);
  const isMountedRef = useRef(true);

  const resetEntryUiState = useCallback(({ hasMore = true, error: nextError = '' } = {}) => {
    setEntries([]);
    setEntriesHasMore(hasMore);
    setEntriesLoading(false);
    setEntriesLoadingMore(false);
    setEntriesError(nextError);
    setCopiedEntryId('');
    setPinningIds(() => new Set());
  }, []);

  useEffect(
    () => () => {
      isMountedRef.current = false;
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    setActiveKey(routeKey);
  }, [routeKey]);

  useEffect(() => {
    if (!token) {
      setLoadingSections(false);
      resetEntryUiState({ hasMore: false });
      setFilters(() => ({ ...DEFAULT_FILTERS }));
      setPages([]);
    }
  }, [token, resetEntryUiState]);

  useEffect(() => {
    if (!token) return;
    let ignore = false;

    async function loadSections() {
      setLoadingSections(true);
      try {
        const res = await axios.get('/api/sections');
        if (ignore) return;
        setAllSections(Array.isArray(res.data) ? res.data : []);
      } catch (e) {
        if (!ignore) {
          console.warn('Section list failed:', e?.response?.data || e.message);
          setAllSections([]);
        }
      } finally {
        if (!ignore) setLoadingSections(false);
      }
    }

    loadSections();
    return () => {
      ignore = true;
    };
  }, [token]);

  useEffect(() => {
    if (!token || !activeKey) {
      setPages([]);
      return;
    }

    let ignore = false;
    async function loadDetail() {
      setLoadingDetail(true);
      setError('');
      try {
        const pagesRes = await axios.get(`/api/section-pages/by-section/${encodeURIComponent(activeKey)}`);
        const rawPages = Array.isArray(pagesRes.data?.items)
          ? pagesRes.data.items
          : Array.isArray(pagesRes.data)
            ? pagesRes.data
            : [];
        const normalizedPages = rawPages
          .map((p) => ({
            _id: p._id || p.id,
            slug: p.slug || '',
            title: p.title || p.name || 'Untitled page',
            icon: p.icon || p.emoji || '📄',
          }))
          .filter((p) => p._id && p.slug);
        if (!ignore) setPages(normalizedPages);
      } catch (e) {
        if (!ignore) {
          console.warn('Section detail failed:', e?.response?.data || e.message);
          setPages([]);
          setError('We could not load this section right now.');
        }
      } finally {
        if (!ignore) setLoadingDetail(false);
      }
    }

    loadDetail();
    return () => {
      ignore = true;
    };
  }, [token, activeKey]);

  useEffect(() => {
    setActivePane('entries');
  }, [activeKey]);

  const normalizedSections = useMemo(() => {
    return (allSections || [])
      .map((s) => ({
        id: s._id || s.id || null,
        key: (s.key || s.slug || '').toLowerCase(),
        label: s.label || s.name || s.key || 'Untitled section',
        icon: s.icon || s.emoji || '📚',
        color: s.color || s.themeColor || 'var(--color-thread, #6b6bff)',
        pinned: !!s.pinned,
        order: Number.isFinite(s.order) ? s.order : 0,
        summary: s.summary || s.description || '',
        tagline: s.tagline || s.subtitle || '',
      }))
      .filter((s) => s.key)
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        if (a.order !== b.order) return a.order - b.order;
        return a.label.localeCompare(b.label);
      });
  }, [allSections]);

  const activeSection = useMemo(
    () => normalizedSections.find((s) => s.key === activeKey) || null,
    [normalizedSections, activeKey],
  );

  useEffect(() => {
    resetEntryUiState();
    setFilters(() => ({ ...DEFAULT_FILTERS }));
  }, [activeSection?.id, resetEntryUiState]);

  const makeEntryParams = useCallback(
    (offset = 0) => {
      if (!activeSection?.id) return null;
      const params = {
        sectionId: activeSection.id,
        limit: PAGE_SIZE,
        offset,
      };
      if (activeSection?.key) params.section = activeSection.key;

      const { startDate, endDate, tag, mood } = filters;
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      if (tag) params.tag = tag;
      if (mood) params.mood = mood;

      return params;
    },
    [activeSection?.id, activeSection?.key, filters],
  );

  const title = activeSection ? activeSection.label : 'Sections';

  const compareEntries = useCallback((a, b) => {
    const pinnedA = Boolean(a?.pinned);
    const pinnedB = Boolean(b?.pinned);
    if (pinnedA !== pinnedB) return pinnedA ? -1 : 1;

    const dateA = a?.date || '';
    const dateB = b?.date || '';
    if (dateA && dateB && dateA !== dateB) {
      return dateB.localeCompare(dateA);
    }
    if (!dateA && dateB) return 1;
    if (dateA && !dateB) return -1;

    const timeA = Date.parse(a?.updatedAt || a?.createdAt || '') || 0;
    const timeB = Date.parse(b?.updatedAt || b?.createdAt || '') || 0;
    if (timeA !== timeB) return timeB - timeA;

    const idA = (a?._id || a?.id || '').toString();
    const idB = (b?._id || b?.id || '').toString();
    if (idA && idB && idA !== idB) {
      return idB.localeCompare(idA);
    }
    return 0;
  }, []);

  const normalizeEntries = useCallback(
    (list) => {
      if (!Array.isArray(list) || list.length === 0) return [];
      const map = new Map();
      const fallback = [];
      for (const entry of list) {
        const id = entry?._id || entry?.id;
        if (id) {
          map.set(id, entry);
        } else {
          fallback.push(entry);
        }
      }
      const deduped = [...map.values(), ...fallback];
      return deduped.sort(compareEntries);
    },
    [compareEntries],
  );

  useEffect(() => {
    if (!token) return;

    if (dateRangeInvalid) {
      resetEntryUiState({ hasMore: false });
      return;
    }

    const params = makeEntryParams(0);
    if (!params) {
      resetEntryUiState({ hasMore: false });
      return;
    }

    let ignore = false;
    setEntriesLoading(true);
    setEntriesLoadingMore(false);
    setEntriesError('');
    setEntriesHasMore(true);
    setEntries([]);
    setCopiedEntryId('');
    setPinningIds(() => new Set());

    axios
      .get('/api/entries', { params })
      .then((res) => {
        if (ignore) return;
        const rows = Array.isArray(res.data) ? res.data : [];
        const normalizedRows = normalizeEntries(rows);
        setEntries(normalizedRows);
        setEntriesHasMore(rows.length === params.limit);
      })
      .catch((err) => {
        if (ignore) return;
        console.warn('Section entries load failed:', err?.response?.data || err.message);
        resetEntryUiState({ hasMore: false, error: 'Unable to load entries right now.' });
      })
      .finally(() => {
        if (!ignore) setEntriesLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [
    token,
    makeEntryParams,
    normalizeEntries,
    dateRangeInvalid,
    resetEntryUiState,
  ]);

  const handleSelect = useCallback(
    (section) => {
      if (!section?.key) return;
      setActiveKey(section.key);
      navigate(`/sections/${encodeURIComponent(section.key)}`);
    },
    [navigate],
  );

  const loadMoreEntries = useCallback(() => {
    if (!token || entriesLoading || entriesLoadingMore || !entriesHasMore || dateRangeInvalid) return;

    const params = makeEntryParams(entries.length);
    if (!params) return;

    setEntriesLoadingMore(true);

    axios
      .get('/api/entries', { params })
      .then((res) => {
        if (!isMountedRef.current) return;
        const rows = Array.isArray(res.data) ? res.data : [];
        if (rows.length === 0) {
          setEntriesHasMore(false);
          return;
        }
        setEntries((prev) => normalizeEntries([...prev, ...rows]));
        setEntriesHasMore(rows.length === params.limit);
      })
      .catch((err) => {
        if (!isMountedRef.current) return;
        console.warn('Section loadMore entries failed:', err?.response?.data || err.message);
        setEntriesError((prev) => prev || 'Unable to load more entries.');
        setEntriesHasMore(false);
      })
      .finally(() => {
        if (isMountedRef.current) setEntriesLoadingMore(false);
      });
  }, [
    token,
    entriesLoading,
    entriesLoadingMore,
    entriesHasMore,
    dateRangeInvalid,
    entries.length,
    makeEntryParams,
    normalizeEntries,
  ]);

  const handleFilterChange = useCallback((field, value) => {
    setFilters((prev) => {
      const normalizedValue = typeof value === 'string' ? value.trim() : value;
      if (prev[field] === normalizedValue) return prev;
      return { ...prev, [field]: normalizedValue ?? '' };
    });
  }, []);

  const resetFilters = useCallback(() => {
    setFilters((prev) => {
      if (!prev.startDate && !prev.endDate && !prev.tag && !prev.mood) {
        return prev;
      }
      return { ...DEFAULT_FILTERS };
    });
  }, []);

  const togglePinForEntry = useCallback(
    async (entry) => {
      if (!entry?._id || !token) return;

      const entryId = entry._id;
      setPinningIds((prev) => {
        const next = new Set(prev);
        next.add(entryId);
        return next;
      });

      try {
        const res = await axios.patch(`/api/entries/${entryId}`, { pinned: !entry.pinned });
        if (!isMountedRef.current) return;
        const updated = res?.data;
        setEntries((prev) => {
          const patched = prev.map((item) => {
            if (item._id !== entryId) return item;
            if (updated && typeof updated === 'object') {
              return { ...item, ...updated };
            }
            return { ...item, pinned: !entry.pinned };
          });
          return normalizeEntries(patched);
        });
        setEntriesError('');
      } catch (err) {
        console.warn('Toggle pin failed:', err?.response?.data || err.message);
        if (isMountedRef.current) {
          setEntriesError('Unable to update pin status.');
        }
      } finally {
        if (isMountedRef.current) {
          setPinningIds((prev) => {
            const next = new Set(prev);
            next.delete(entryId);
            return next;
          });
        }
      }
    },
    [token, normalizeEntries],
  );

  const handleCopyLink = useCallback(
    async (entry) => {
      if (!entry?._id) return;

      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const fallbackPath = `/sections/${activeKey || ''}`;
      const browserPath = typeof window !== 'undefined' ? window.location.pathname || fallbackPath : fallbackPath;
      const path = entry.date ? `/day/${entry.date}` : browserPath;
      const url = `${origin}${path}#entry-${entry._id}`;

      try {
        const canUseClipboard = typeof navigator !== 'undefined' && navigator.clipboard?.writeText;
        if (canUseClipboard) {
          await navigator.clipboard.writeText(url);
          if (!isMountedRef.current) return;
          setCopiedEntryId(entry._id);
          if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
          copyTimeoutRef.current = setTimeout(() => {
            setCopiedEntryId('');
          }, 2000);
        } else if (typeof window !== 'undefined') {
          const confirmed = window.prompt('Copy link to this entry:', url);
          if (confirmed !== null && isMountedRef.current) {
            setCopiedEntryId(entry._id);
            if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
            copyTimeoutRef.current = setTimeout(() => {
              setCopiedEntryId('');
            }, 2000);
          }
        }
      } catch (err) {
        console.warn('Copy entry link failed:', err?.message || err);
        if (isMountedRef.current) {
          setEntriesError('Unable to copy link to clipboard.');
        }
      }
    },
    [activeKey],
  );

  const dateRangeInvalid = useMemo(
    () => Boolean(filters.startDate && filters.endDate && filters.startDate > filters.endDate),
    [filters.startDate, filters.endDate],
  );

  const hasActiveFilters = useMemo(
    () => Boolean(filters.startDate || filters.endDate || filters.tag || filters.mood),
    [filters.startDate, filters.endDate, filters.tag, filters.mood],
  );

  useEffect(() => {
    if (!entriesHasMore || entriesLoading || entriesLoadingMore || dateRangeInvalid) return;
    const node = sentinelRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entriesList) => {
        const first = entriesList[0];
        if (first?.isIntersecting) {
          loadMoreEntries();
        }
      },
      { rootMargin: '200px 0px', threshold: 0.1 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [entriesHasMore, entriesLoading, entriesLoadingMore, loadMoreEntries, dateRangeInvalid]);

  const loading = loadingSections || (activeKey ? loadingDetail : false);

  return (
    <div className="sections-page">
      <aside className="sections-sidebar">
        <div className="sidebar-head">
          <h2>Sections</h2>
          <span className="sidebar-count">{loadingSections ? '…' : `${normalizedSections.length}`}</span>
        </div>

        {loadingSections && <div className="muted">Loading…</div>}

        {!loadingSections && normalizedSections.length === 0 && (
          <div className="empty">No sections yet. Clusters can auto-create them for you.</div>
        )}

        <ul className="section-list">
          {normalizedSections.map((section) => {
            const active = section.key === activeKey;
            return (
              <li key={section.key} className={`section-item ${active ? 'active' : ''}`}>
                <button type="button" className="section-link" onClick={() => handleSelect(section)}>
                  <span className="color-dot" style={{ background: section.color }} />
                  <span className="icon">{section.icon}</span>
                  <span className="label">{section.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      <main className="sections-main">
        {!activeKey && (
          <div className="sections-landing">
            <div className="sections-hero">
              <h1>Sections keep your story organised</h1>
              <p>
                Every cluster can have one or more sections. Pick one from the left to see its journal entries, pages and
                tasks.
              </p>
            </div>

            {normalizedSections.length > 0 && (
              <div className="sections-grid">
                {normalizedSections.slice(0, 6).map((section) => (
                  <button
                    key={section.key}
                    type="button"
                    className="section-card"
                    onClick={() => handleSelect(section)}
                  >
                    <span className="emoji" aria-hidden="true">{section.icon}</span>
                    <div className="card-body">
                      <h3>{section.label}</h3>
                      <p>{section.tagline || section.summary || 'Track entries, notes and rituals for this area.'}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {activeKey && (
          <div className="sections-detail">
            <header className="sections-header">
              <div className="title">
                <h1>{activeSection ? `${activeSection.icon} ${activeSection.label}` : title}</h1>
                {activeSection?.tagline && <div className="subtitle">{activeSection.tagline}</div>}
              </div>
              <div className="tab-group" role="tablist">
                {VIEW_TABS.map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    className={`tab ${activePane === key ? 'active' : ''}`}
                    onClick={() => setActivePane(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </header>

            {activeSection?.summary && <p className="section-summary">{activeSection.summary}</p>}

            {error && <div className="callout error">{error}</div>}

            {loading && !error && <div className="loading">Loading…</div>}

            {!loading && !error && activePane === 'entries' && (
              <div className="entries-pane">
                <div className="entries-filter-bar">
                  <div className="filter-field">
                    <label htmlFor="entries-from">From</label>
                    <input
                      id="entries-from"
                      type="date"
                      value={filters.startDate}
                      onChange={(e) => handleFilterChange('startDate', e.target.value)}
                    />
                  </div>
                  <div className="filter-field">
                    <label htmlFor="entries-to">To</label>
                    <input
                      id="entries-to"
                      type="date"
                      value={filters.endDate}
                      onChange={(e) => handleFilterChange('endDate', e.target.value)}
                    />
                  </div>
                  <div className="filter-field">
                    <label htmlFor="entries-tag">Tag</label>
                    <input
                      id="entries-tag"
                      type="text"
                      value={filters.tag}
                      placeholder="Any tag"
                      onChange={(e) => handleFilterChange('tag', e.target.value)}
                    />
                  </div>
                  <div className="filter-field">
                    <label htmlFor="entries-mood">Mood</label>
                    <input
                      id="entries-mood"
                      type="text"
                      value={filters.mood}
                      placeholder="Any mood"
                      onChange={(e) => handleFilterChange('mood', e.target.value)}
                    />
                  </div>
                  <button
                    type="button"
                    className="filter-reset"
                    onClick={resetFilters}
                    disabled={!hasActiveFilters}
                  >
                    Reset
                  </button>
                </div>

                {dateRangeInvalid && (
                  <div className="filter-warning" role="status">
                    Start date must be before end date.
                  </div>
                )}

                {entriesError && !entriesLoading && <div className="callout error">{entriesError}</div>}

                {entriesLoading && entries.length === 0 && <div className="loading">Loading entries…</div>}

                {!entriesLoading && !entriesError && entries.length === 0 && (
                  <div className="empty">No entries yet. Capture your first reflection for this section.</div>
                )}

                {entries.length > 0 && (
                  <div className="entry-feed">
                    {entries.map((entry) => {
                      const id = entry._id || entry.id;
                      const tags = Array.isArray(entry.tags) ? entry.tags : [];
                      const isPinning = pinningIds instanceof Set && id ? pinningIds.has(id) : false;
                      const isCopied = copiedEntryId === id;
                      const timestamp = formatEntryTimestamp(entry);
                      return (
                        <article key={id} className={`entry-card ${entry.pinned ? 'pinned' : ''}`}>
                          <header className="entry-card-head">
                            <div className="entry-card-meta">
                              <span className="entry-date">{entry.date || 'Undated'}</span>
                              {timestamp && <span className="entry-updated">Updated {timestamp}</span>}
                              {entry.pinned && <span className="entry-flag">Pinned</span>}
                              {entry.mood && <span className="pill">{entry.mood}</span>}
                            </div>
                            <div className="entry-actions">
                              <button
                                type="button"
                                className="entry-action"
                                onClick={() => togglePinForEntry(entry)}
                                disabled={isPinning}
                                aria-pressed={entry.pinned}
                                aria-label={entry.pinned ? 'Unpin entry' : 'Pin entry'}
                                title={entry.pinned ? 'Unpin entry' : 'Pin entry'}
                              >
                                {isPinning ? '…' : entry.pinned ? '📌' : '📍'}
                              </button>
                              <button
                                type="button"
                                className="entry-action"
                                onClick={() => handleCopyLink(entry)}
                                aria-label="Copy link to entry"
                                title={isCopied ? 'Link copied!' : 'Copy link'}
                              >
                                {isCopied ? '✅' : '🔗'}
                              </button>
                            </div>
                          </header>

                          {tags.length > 0 && (
                            <div className="entry-tags">
                              {tags.slice(0, 8).map((tag, idx) => (
                                <span key={`${id}-tag-${idx}`} className="pill pill-muted">#{tag}</span>
                              ))}
                            </div>
                          )}

                          <SafeHTML className="entry-text" html={renderEntryHtml(entry)} />
                        </article>
                      );
                    })}
                  </div>
                )}

                <div className="entries-footer">
                  {entriesHasMore && <div ref={sentinelRef} className="entries-sentinel" aria-hidden="true" />}
                  {entriesLoadingMore && <div className="loading">Loading more…</div>}
                  {entriesHasMore && !entriesLoadingMore && (
                    <button type="button" className="entries-load-more" onClick={loadMoreEntries}>
                      Load more entries
                    </button>
                  )}
                  {!entriesHasMore && entries.length > 0 && !entriesLoadingMore && (
                    <div className="entries-end">You have reached the latest entries.</div>
                  )}
                </div>
              </div>
            )}

            {!loading && !error && activePane === 'pages' && (
              <div className="pages-grid" id="pages">
                {pages.length === 0 ? (
                  <div className="empty">No pages yet for this section.</div>
                ) : (
                  pages.map((page) => (
                    <Link
                      key={page._id}
                      to={`/sections/${encodeURIComponent(activeKey)}/${encodeURIComponent(page.slug)}`}
                      className="page-chip"
                    >
                      <span className="emoji" aria-hidden="true">{page.icon}</span>
                      <div>
                        <h3>{page.title}</h3>
                        <span>Open room →</span>
                      </div>
                    </Link>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </main>

      {token && (
        <aside className="sections-rail">
          <TaskList view="today" section={activeKey || undefined} header={activeKey ? `Today in “${title}”` : 'Today'} />
        </aside>
      )}
    </div>
  );
}
