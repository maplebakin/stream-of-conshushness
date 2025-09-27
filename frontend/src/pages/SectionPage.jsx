// frontend/src/pages/SectionPage.jsx
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useState, useEffect, useContext, useMemo } from 'react';
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

function sortEntries(entries = []) {
  const list = Array.isArray(entries) ? [...entries] : [];
  return list.sort((a, b) => {
    const aKey = a?.createdAt || a?.updatedAt || `${a?.date ?? ''}T00:00:00`;
    const bKey = b?.createdAt || b?.updatedAt || `${b?.date ?? ''}T00:00:00`;
    return aKey > bKey ? -1 : aKey < bKey ? 1 : 0;
  });
}

function renderEntryHtml(entry) {
  if (entry?.html && entry.html.trim()) return entry.html;
  if (typeof entry?.content === 'string' && /<[^>]+>/.test(entry.content)) return entry.content;
  return (entry?.text ?? '').replace(/\n/g, '<br/>');
}

export default function SectionPage() {
  const navigate = useNavigate();
  const params = useParams();
  const routeKey = (params.key || params.sectionName || '').toLowerCase();

  const { token } = useContext(AuthContext);

  const [entries, setEntries] = useState([]);
  const [pages, setPages] = useState([]);
  const [allSections, setAllSections] = useState([]);
  const [loadingSections, setLoadingSections] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState('');
  const [activePane, setActivePane] = useState('entries');
  const [activeKey, setActiveKey] = useState(routeKey);

  useEffect(() => {
    setActiveKey(routeKey);
  }, [routeKey]);

  useEffect(() => {
    if (!token) {
      setLoadingSections(false);
      setEntries([]);
      setPages([]);
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
      setEntries([]);
      setPages([]);
      return;
    }

    let ignore = false;
    async function loadDetail() {
      setLoadingDetail(true);
      setError('');
      try {
        const entryRes = await axios.get(`/api/entries?section=${encodeURIComponent(activeKey)}&limit=100`);
        if (!ignore) setEntries(Array.isArray(entryRes.data) ? entryRes.data : []);

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
          setEntries([]);
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

  const sortedEntries = useMemo(() => sortEntries(entries), [entries]);
  const title = activeSection ? activeSection.label : 'Sections';

  function handleSelect(section) {
    if (!section?.key) return;
    setActiveKey(section.key);
    navigate(`/sections/${encodeURIComponent(section.key)}`);
  }

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
              <div className="entries-stack">
                {sortedEntries.length === 0 ? (
                  <div className="empty">No entries yet. Capture your first reflection for this section.</div>
                ) : (
                  sortedEntries.map((entry) => (
                    <article key={entry._id} className="entry-card">
                      <div className="entry-meta">
                        <span className="date">{entry.date}</span>
                        {entry.mood && <span className="pill">{entry.mood}</span>}
                        {Array.isArray(entry.tags) &&
                          entry.tags.slice(0, 5).map((tag, idx) => (
                            <span key={idx} className="pill pill-muted">#{tag}</span>
                          ))}
                      </div>
                      <SafeHTML className="entry-text" html={renderEntryHtml(entry)} />
                    </article>
                  ))
                )}
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
