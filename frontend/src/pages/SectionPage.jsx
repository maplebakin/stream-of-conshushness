// frontend/src/pages/SectionPage.jsx
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  useState,
  useEffect,
  useContext,
  useMemo,
  useRef,
  useCallback,
} from 'react';
import axios from '../api/axiosInstance.js';
import { AuthContext } from '../AuthContext.jsx';
import TaskList from '../adapters/TaskList.default.jsx';
import '../Main.css';
import SafeHTML from '../components/SafeHTML.jsx';
import './SectionPage.css';

const VIEW_TABS = [
  { key: 'entries', label: 'Entries' },
  { key: 'pages', label: 'Pages' },
  { key: 'tasks', label: 'Tasks' },
];

const ENTRY_PAGE_SIZE = 20;

function sortEntries(entries = []) {
  const list = Array.isArray(entries) ? [...entries] : [];
  return list.sort((a, b) => {
    if (!!a?.pinned !== !!b?.pinned) return a?.pinned ? -1 : 1;
    const aCreated = a?.createdAt || '';
    const bCreated = b?.createdAt || '';
    if (aCreated && bCreated && aCreated !== bCreated) {
      return aCreated > bCreated ? -1 : 1;
    }
    const aKey = a?.updatedAt || `${a?.date ?? ''}T00:00:00`;
    const bKey = b?.updatedAt || `${b?.date ?? ''}T00:00:00`;
    return aKey > bKey ? -1 : aKey < bKey ? 1 : 0;
  });
}

function renderEntryHtml(entry) {
  if (entry?.html && entry.html.trim()) return entry.html;
  if (typeof entry?.content === 'string' && /<[^>]+>/.test(entry.content)) return entry.content;
  return (entry?.text ?? '').replace(/\n/g, '<br/>');
}

function sortTasksByDue(tasks = []) {
  const list = Array.isArray(tasks) ? [...tasks] : [];
  return list.sort((a, b) => {
    if (!!a?.completed !== !!b?.completed) return a?.completed ? 1 : -1;
    if (a?.dueDate && b?.dueDate && a.dueDate !== b.dueDate) {
      return a.dueDate.localeCompare(b.dueDate);
    }
    if (!a?.dueDate && b?.dueDate) return 1;
    if (a?.dueDate && !b?.dueDate) return -1;
    const aPriority = Number.isFinite(Number(a?.priority)) ? Number(a.priority) : 0;
    const bPriority = Number.isFinite(Number(b?.priority)) ? Number(b.priority) : 0;
    if (aPriority !== bPriority) return bPriority - aPriority;
    return (a?.title || '').localeCompare(b?.title || '');
  });
}

function isoForOffset(days = 0) {
  const base = new Date();
  base.setHours(12, 0, 0, 0);
  base.setDate(base.getDate() + days);
  return base.toISOString().slice(0, 10);
}

export default function SectionPage() {
  const params = useParams();
  const navigate = useNavigate();
  const routeKey = (params.key || params.sectionName || '').toLowerCase();

  const { token } = useContext(AuthContext);

  const [pages, setPages] = useState([]);
  const [allSections, setAllSections] = useState([]);
  const [loadingSections, setLoadingSections] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [activePane, setActivePane] = useState('entries');
  const [activeKey, setActiveKey] = useState(routeKey);

  const [entriesState, setEntriesState] = useState({ items: [], cursor: null, hasMore: false });
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [loadingMoreEntries, setLoadingMoreEntries] = useState(false);
  const [entriesError, setEntriesError] = useState('');
  const entriesSentinelRef = useRef(null);
  const [entryBusyIds, setEntryBusyIds] = useState(() => new Set());
  const [copiedEntryId, setCopiedEntryId] = useState(null);

  const [filters, setFilters] = useState({ startDate: '', endDate: '', tag: '', mood: '' });

  const [tasks, setTasks] = useState([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [tasksError, setTasksError] = useState('');
  const [taskBusyIds, setTaskBusyIds] = useState(() => new Set());
  const [taskView, setTaskView] = useState('list');
  const taskPrefKeyRef = useRef(null);

  useEffect(() => {
    setActiveKey(routeKey);
  }, [routeKey]);

  useEffect(() => {
    if (!token) {
      setLoadingSections(false);
      setEntriesState({ items: [], cursor: null, hasMore: false });
      setPages([]);
      setTasks([]);
    }
  }, [token]);

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
    async function loadPages() {
      setLoadingDetail(true);
      setDetailError('');
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
          setDetailError('We could not load this section right now.');
        }
      } finally {
        if (!ignore) setLoadingDetail(false);
      }
    }

    loadPages();
    return () => {
      ignore = true;
    };
  }, [token, activeKey]);

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

  const activeSectionId = activeSection?.id || null;
  const sectionKeyParam = activeSection?.key || activeKey || '';

  const requestEntries = useCallback(
    async (cursor = null) => {
      if (!token) return [];
      if (!activeSectionId && !sectionKeyParam) return [];

      const params = new URLSearchParams();
      params.set('limit', String(ENTRY_PAGE_SIZE));
      if (activeSectionId) params.set('sectionId', activeSectionId);
      if (sectionKeyParam) params.set('section', sectionKeyParam);
      if (filters.startDate) params.set('startDate', filters.startDate);
      if (filters.endDate) params.set('endDate', filters.endDate);
      if (filters.tag) params.set('tag', filters.tag.trim().replace(/^#/, ''));
      if (filters.mood) params.set('mood', filters.mood);
      if (cursor) params.set('cursor', cursor);

      const res = await axios.get(`/api/entries?${params.toString()}`);
      return Array.isArray(res.data) ? res.data : [];
    },
    [token, activeSectionId, sectionKeyParam, filters.startDate, filters.endDate, filters.tag, filters.mood],
  );

  useEffect(() => {
    if (!token) return;
    if (!sectionKeyParam && !activeSectionId) {
      setEntriesState({ items: [], cursor: null, hasMore: false });
      return;
    }

    let ignore = false;
    setEntriesError('');
    setEntriesState({ items: [], cursor: null, hasMore: false });
    setLoadingEntries(true);

    requestEntries()
      .then((rows) => {
        if (ignore) return;
        const nextCursor = rows.length === ENTRY_PAGE_SIZE ? rows[rows.length - 1]?._id || null : null;
        setEntriesState({
          items: rows,
          cursor: nextCursor,
          hasMore: rows.length === ENTRY_PAGE_SIZE,
        });
      })
      .catch((err) => {
        if (ignore) return;
        console.warn('Section entries failed:', err?.response?.data || err.message);
        setEntriesError('We could not load entries right now.');
        setEntriesState({ items: [], cursor: null, hasMore: false });
      })
      .finally(() => {
        if (!ignore) setLoadingEntries(false);
      });

    return () => {
      ignore = true;
    };
  }, [token, activeSectionId, sectionKeyParam, requestEntries]);

  const loadMoreEntries = useCallback(async () => {
    if (loadingMoreEntries) return;
    if (!entriesState.hasMore || !entriesState.cursor) return;

    setLoadingMoreEntries(true);
    try {
      const rows = await requestEntries(entriesState.cursor);
      setEntriesState((prev) => {
        const merged = [...prev.items];
        const seen = new Set(merged.map((item) => item?._id));
        for (const row of rows) {
          if (!row?._id || seen.has(row._id)) continue;
          merged.push(row);
          seen.add(row._id);
        }
        const nextCursor = rows.length === ENTRY_PAGE_SIZE ? rows[rows.length - 1]?._id || null : null;
        return {
          items: merged,
          cursor: nextCursor,
          hasMore: rows.length === ENTRY_PAGE_SIZE,
        };
      });
    } catch (err) {
      console.warn('More entries failed:', err?.response?.data || err.message);
      setEntriesError('We could not load more entries.');
    } finally {
      setLoadingMoreEntries(false);
    }
  }, [entriesState.cursor, entriesState.hasMore, loadingMoreEntries, requestEntries]);

  const isEntriesPane = activePane === 'entries';

  useEffect(() => {
    if (!isEntriesPane) return;
    const node = entriesSentinelRef.current;
    if (!node) return;
    if (!entriesState.hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          loadMoreEntries();
        }
      },
      { root: null, rootMargin: '200px', threshold: 0 },
    );

    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, [entriesState.hasMore, isEntriesPane, loadMoreEntries]);

  useEffect(() => {
    if (!copiedEntryId) return;
    const timer = setTimeout(() => setCopiedEntryId(null), 2000);
    return () => clearTimeout(timer);
  }, [copiedEntryId]);

  useEffect(() => {
    if (!token || !activeKey) {
      setTasks([]);
      return;
    }

    let ignore = false;
    setTasksError('');
    setLoadingTasks(true);

    axios
      .get(`/api/tasks?section=${encodeURIComponent(activeKey)}&includeCompleted=1`)
      .then((res) => {
        if (ignore) return;
        setTasks(Array.isArray(res.data) ? res.data : []);
      })
      .catch((err) => {
        if (ignore) return;
        console.warn('Section tasks failed:', err?.response?.data || err.message);
        setTasks([]);
        setTasksError('We could not load tasks for this section.');
      })
      .finally(() => {
        if (!ignore) setLoadingTasks(false);
      });

    return () => {
      ignore = true;
    };
  }, [token, activeKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const prefKey = activeSectionId || activeSection?.key || activeKey;
    if (!prefKey) return;
    if (taskPrefKeyRef.current === prefKey) return;
    taskPrefKeyRef.current = prefKey;
    const saved = window.localStorage.getItem(`sectionTasksView:${prefKey}`);
    if (saved === 'kanban' || saved === 'list') {
      setTaskView(saved);
    } else {
      setTaskView('list');
    }
  }, [activeSectionId, activeSection?.key, activeKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const prefKey = activeSectionId || activeSection?.key || activeKey;
    if (!prefKey) return;
    window.localStorage.setItem(`sectionTasksView:${prefKey}`, taskView);
  }, [taskView, activeSectionId, activeSection?.key, activeKey]);

  const sortedEntries = useMemo(() => sortEntries(entriesState.items), [entriesState.items]);
  const entryBusySet = entryBusyIds;

  const normalizedTasks = useMemo(() => {
    return (tasks || []).map((task) => ({
      ...task,
      status: task?.status || (task?.completed ? 'done' : 'todo'),
    }));
  }, [tasks]);

  const sectionKeyLower = (activeKey || '').toLowerCase();
  const sectionTasks = useMemo(() => {
    return normalizedTasks.filter((task) => {
      const sections = Array.isArray(task?.sections) ? task.sections : [];
      if (!sections.length) return !sectionKeyLower;
      return sections.some((sec) => (sec || '').toLowerCase() === sectionKeyLower);
    });
  }, [normalizedTasks, sectionKeyLower]);

  const sortedTaskList = useMemo(() => sortTasksByDue(sectionTasks), [sectionTasks]);

  const tasksColumns = useMemo(() => {
    const buckets = { todo: [], doing: [], done: [] };
    for (const task of sectionTasks) {
      const bucket = buckets[task.status] ? task.status : task.completed ? 'done' : 'todo';
      buckets[bucket].push(task);
    }
    return {
      todo: sortTasksByDue(buckets.todo),
      doing: sortTasksByDue(buckets.doing),
      done: sortTasksByDue(buckets.done),
    };
  }, [sectionTasks]);

  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat('en-CA', { month: 'short', day: 'numeric', year: 'numeric' }),
    [],
  );

  function describeDueDate(dateISO) {
    if (!dateISO) return 'No due date';
    try {
      const [y, m, d] = dateISO.split('-').map((part) => parseInt(part, 10));
      if (!y || !m || !d) throw new Error('bad date');
      const dt = new Date(Date.UTC(y, m - 1, d, 12));
      return `Due ${dateFormatter.format(dt)}`;
    } catch (err) {
      return `Due ${dateISO}`;
    }
  }

  function markEntryBusy(id, busy) {
    if (!id) return;
    setEntryBusyIds((prev) => {
      const next = new Set(prev);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function markTaskBusy(id, busy) {
    if (!id) return;
    setTaskBusyIds((prev) => {
      const next = new Set(prev);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function toggleEntryPin(entry) {
    if (!entry?._id) return;
    markEntryBusy(entry._id, true);
    const nextPinned = !entry.pinned;
    try {
      const res = await axios.patch(`/api/entries/${entry._id}`, { pinned: nextPinned });
      const updated = res.data && typeof res.data === 'object' ? res.data : { ...entry, pinned: nextPinned };
      setEntriesState((prev) => ({
        ...prev,
        items: prev.items.map((item) => (item._id === entry._id ? { ...item, ...updated } : item)),
      }));
    } catch (err) {
      console.warn('Pin entry failed:', err?.response?.data || err.message);
      setEntriesError('Could not update entry.');
    } finally {
      markEntryBusy(entry._id, false);
    }
  }

  async function copyEntryLink(entry) {
    if (!entry?._id) return;
    const url = `${window.location.origin}/entries/${entry._id}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedEntryId(entry._id);
    } catch (err) {
      console.warn('Copy link failed:', err?.message || err);
      window.prompt('Copy entry link', url);
    }
  }

  function updateFilter(key, value) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  function clearFilters() {
    setFilters({ startDate: '', endDate: '', tag: '', mood: '' });
  }

  async function addTask() {
    if (!activeKey) return;
    if (typeof window === 'undefined') return;
    const title = window.prompt('New task title');
    if (!title) return;
    try {
      const res = await axios.post('/api/tasks', {
        title,
        sections: [activeKey],
        status: 'todo',
      });
      const created = res.data;
      setTasks((prev) => [created, ...prev]);
    } catch (err) {
      console.warn('Add task failed:', err?.response?.data || err.message);
      setTasksError('Could not add task.');
    }
  }

  async function toggleTaskCompletion(task) {
    if (!task?._id) return;
    markTaskBusy(task._id, true);
    try {
      const res = await axios.patch(`/api/tasks/${task._id}/toggle`);
      const updated = res.data?.task || null;
      const nextTask = res.data?.next || null;
      setTasks((prev) => {
        let next = prev.map((item) => (item._id === task._id ? (updated || item) : item));
        if (nextTask) next = [nextTask, ...next];
        return next;
      });
    } catch (err) {
      console.warn('Toggle task failed:', err?.response?.data || err.message);
      setTasksError('Could not update task.');
    } finally {
      markTaskBusy(task._id, false);
    }
  }

  async function updateTaskDueDate(task, dueDate) {
    if (!task?._id) return;
    markTaskBusy(task._id, true);
    try {
      const res = await axios.patch(`/api/tasks/${task._id}`, { dueDate: dueDate || null });
      const updated = res.data;
      setTasks((prev) => prev.map((item) => (item._id === task._id ? updated : item)));
    } catch (err) {
      console.warn('Update due date failed:', err?.response?.data || err.message);
      setTasksError('Could not update task.');
    } finally {
      markTaskBusy(task._id, false);
    }
  }

  async function updateTaskStatus(task, status) {
    if (!task?._id || !status) return;
    markTaskBusy(task._id, true);
    try {
      const res = await axios.patch(`/api/tasks/${task._id}`, { status });
      const updated = res.data;
      setTasks((prev) => prev.map((item) => (item._id === task._id ? updated : item)));
    } catch (err) {
      console.warn('Update task status failed:', err?.response?.data || err.message);
      setTasksError('Could not update task.');
    } finally {
      markTaskBusy(task._id, false);
    }
  }

  function handleSelect(section) {
    if (!section?.key) return;
    setActiveKey(section.key);
    navigate(`/sections/${encodeURIComponent(section.key)}`);
  }

  useEffect(() => {
    setActivePane('entries');
  }, [activeKey]);

  const hasFilters = !!(filters.startDate || filters.endDate || filters.tag || filters.mood);

  const isEntriesLoading = loadingEntries && sortedEntries.length === 0;
  const isPagesLoading = loadingDetail && pages.length === 0;
  const isTasksLoading = loadingTasks && sectionTasks.length === 0;

  const loading =
    loadingSections ||
    (activeKey
      ? activePane === 'entries'
        ? isEntriesLoading
        : activePane === 'pages'
          ? isPagesLoading
          : activePane === 'tasks'
            ? isTasksLoading
            : false
      : false);

  const title = activeSection ? activeSection.label : 'Sections';

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

            {activePane === 'entries' && entriesError && <div className="callout error">{entriesError}</div>}
            {activePane === 'pages' && detailError && <div className="callout error">{detailError}</div>}
            {activePane === 'tasks' && tasksError && <div className="callout error">{tasksError}</div>}

            {loading && <div className="loading">Loading…</div>}

            {!loading && activePane === 'entries' && (
              <div className="entries-pane">
                <div className="entries-filters">
                  <div className="filter-field">
                    <label htmlFor="filter-start">From</label>
                    <input
                      id="filter-start"
                      type="date"
                      value={filters.startDate}
                      onChange={(e) => updateFilter('startDate', e.target.value)}
                    />
                  </div>
                  <div className="filter-field">
                    <label htmlFor="filter-end">To</label>
                    <input
                      id="filter-end"
                      type="date"
                      value={filters.endDate}
                      onChange={(e) => updateFilter('endDate', e.target.value)}
                    />
                  </div>
                  <div className="filter-field">
                    <label htmlFor="filter-tag">Tag</label>
                    <input
                      id="filter-tag"
                      type="text"
                      placeholder="#tag"
                      value={filters.tag}
                      onChange={(e) => updateFilter('tag', e.target.value)}
                    />
                  </div>
                  <div className="filter-field">
                    <label htmlFor="filter-mood">Mood</label>
                    <input
                      id="filter-mood"
                      type="text"
                      placeholder="happy, calm…"
                      value={filters.mood}
                      onChange={(e) => updateFilter('mood', e.target.value)}
                    />
                  </div>
                  <div className="filter-actions">
                    <button type="button" onClick={clearFilters} disabled={!hasFilters}>
                      Clear filters
                    </button>
                  </div>
                </div>

                <div className="entries-stack">
                  {sortedEntries.length === 0 ? (
                    <div className="empty">No entries yet. Capture your first reflection for this section.</div>
                  ) : (
                    sortedEntries.map((entry) => {
                      const busy = entryBusySet.has(entry._id);
                      return (
                        <article key={entry._id} className={`entry-card ${entry.pinned ? 'pinned' : ''}`}>
                          <header className="entry-card-head">
                            <div className="entry-meta">
                              <span className="date">{entry.date}</span>
                              {entry.mood && <span className="pill">{entry.mood}</span>}
                              {Array.isArray(entry.tags) &&
                                entry.tags.slice(0, 5).map((tag, idx) => (
                                  <span key={idx} className="pill pill-muted">#{tag}</span>
                                ))}
                            </div>
                            <div className="entry-actions">
                              <button
                                type="button"
                                className="entry-action"
                                onClick={() => toggleEntryPin(entry)}
                                disabled={busy}
                              >
                                {entry.pinned ? 'Unpin' : 'Pin'}
                              </button>
                              <button
                                type="button"
                                className="entry-action"
                                onClick={() => copyEntryLink(entry)}
                              >
                                Copy link
                              </button>
                            </div>
                          </header>
                          <SafeHTML className="entry-text" html={renderEntryHtml(entry)} />
                          {copiedEntryId === entry._id && (
                            <div className="entry-footnote">Link copied to clipboard</div>
                          )}
                        </article>
                      );
                    })
                  )}

                  {entriesState.hasMore && (
                    <div ref={entriesSentinelRef} className="entries-sentinel">
                      {loadingMoreEntries ? 'Loading more…' : 'Scroll for more'}
                    </div>
                  )}
                </div>
              </div>
            )}

            {!loading && activePane === 'pages' && (
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

            {!loading && activePane === 'tasks' && (
              <div className="tasks-pane">
                <div className="tasks-toolbar">
                  <button type="button" className="primary" onClick={addTask}>
                    Add task
                  </button>
                  <div className="task-view-toggle">
                    <button
                      type="button"
                      className={taskView === 'list' ? 'active' : ''}
                      onClick={() => setTaskView('list')}
                    >
                      List
                    </button>
                    <button
                      type="button"
                      className={taskView === 'kanban' ? 'active' : ''}
                      onClick={() => setTaskView('kanban')}
                    >
                      Kanban
                    </button>
                  </div>
                </div>

                {taskView === 'list' && (
                  <div className="tasks-list">
                    {sortedTaskList.length === 0 ? (
                      <div className="empty">No tasks yet. Add your first task for this section.</div>
                    ) : (
                      sortedTaskList.map((task) => {
                        const busy = taskBusyIds.has(task._id);
                        return (
                          <div key={task._id} className={`task-row ${task.completed ? 'completed' : ''}`}>
                            <div className="task-main">
                              <h3 className="task-title">{task.title}</h3>
                              <div className="task-meta">
                                <span>{describeDueDate(task.dueDate)}</span>
                                {task.status === 'doing' && <span className="task-status-pill doing">Doing</span>}
                                {task.status === 'done' && <span className="task-status-pill done">Done</span>}
                              </div>
                              {task.notes && <p className="task-notes">{task.notes}</p>}
                            </div>
                            <div className="task-controls">
                              <button
                                type="button"
                                onClick={() => toggleTaskCompletion(task)}
                                disabled={busy}
                              >
                                {task.completed ? 'Mark undone' : 'Mark done'}
                              </button>
                              <div className="task-quick-due">
                                <span>Due</span>
                                <button type="button" onClick={() => updateTaskDueDate(task, isoForOffset(0))} disabled={busy}>
                                  Today
                                </button>
                                <button type="button" onClick={() => updateTaskDueDate(task, isoForOffset(1))} disabled={busy}>
                                  Tomorrow
                                </button>
                                <button type="button" onClick={() => updateTaskDueDate(task, isoForOffset(7))} disabled={busy}>
                                  Next week
                                </button>
                                <button type="button" onClick={() => updateTaskDueDate(task, null)} disabled={busy}>
                                  Clear
                                </button>
                              </div>
                              <label className="task-status-select">
                                <span>Stage</span>
                                <select
                                  value={task.status}
                                  onChange={(e) => updateTaskStatus(task, e.target.value)}
                                  disabled={busy}
                                >
                                  <option value="todo">To Do</option>
                                  <option value="doing">Doing</option>
                                  <option value="done">Done</option>
                                </select>
                              </label>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}

                {taskView === 'kanban' && (
                  <div className="kanban-grid">
                    {['todo', 'doing', 'done'].map((stage) => {
                      const items = tasksColumns[stage] || [];
                      return (
                        <div key={stage} className={`kanban-column stage-${stage}`}>
                          <div className="kanban-column-head">
                            <h3>{stage === 'todo' ? 'To Do' : stage === 'doing' ? 'Doing' : 'Done'}</h3>
                            <span>{items.length}</span>
                          </div>
                          <div className="kanban-column-body">
                            {items.length === 0 ? (
                              <div className="empty">No tasks</div>
                            ) : (
                              items.map((task) => {
                                const busy = taskBusyIds.has(task._id);
                                return (
                                  <div key={task._id} className={`kanban-task ${task.completed ? 'completed' : ''}`}>
                                    <div className="kanban-task-title">{task.title}</div>
                                    <div className="kanban-task-meta">
                                      <span>{describeDueDate(task.dueDate)}</span>
                                      {task.status === 'doing' && <span className="task-status-pill doing">Doing</span>}
                                      {task.status === 'done' && <span className="task-status-pill done">Done</span>}
                                    </div>
                                    {task.notes && <p className="kanban-task-notes">{task.notes}</p>}
                                    <div className="kanban-task-actions">
                                      <button
                                        type="button"
                                        onClick={() => toggleTaskCompletion(task)}
                                        disabled={busy}
                                      >
                                        {task.completed ? 'Mark undone' : 'Mark done'}
                                      </button>
                                      <div className="task-quick-due compact">
                                        <button
                                          type="button"
                                          onClick={() => updateTaskDueDate(task, isoForOffset(0))}
                                          disabled={busy}
                                        >
                                          Today
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => updateTaskDueDate(task, isoForOffset(1))}
                                          disabled={busy}
                                        >
                                          Tomorrow
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => updateTaskDueDate(task, null)}
                                          disabled={busy}
                                        >
                                          Clear
                                        </button>
                                      </div>
                                      <select
                                        value={task.status}
                                        onChange={(e) => updateTaskStatus(task, e.target.value)}
                                        disabled={busy}
                                      >
                                        <option value="todo">To Do</option>
                                        <option value="doing">Doing</option>
                                        <option value="done">Done</option>
                                      </select>
                                    </div>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
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
