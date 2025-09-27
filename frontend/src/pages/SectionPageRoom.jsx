import { useContext, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import axios from '../api/axiosInstance.js';
import { AuthContext } from '../AuthContext.jsx';
import TaskList from '../adapters/TaskList.default.jsx';
import SafeHTML from '../components/SafeHTML.jsx';
import '../Main.css';
import './SectionPage.css';

const ALLOWED_TABS = ['journal', 'manual', 'progress', 'gift-guide'];

function todayISO() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function normalizePageList(raw = []) {
  const arr = Array.isArray(raw) ? raw : [];
  return arr
    .map((p) => ({
      id: p._id || p.id,
      title: p.title || p.name || p.slug || 'Untitled page',
      slug:
        p.slug ||
        (p.title || '')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, ''),
      icon: p.icon || p.emoji || '',
    }))
    .filter((p) => p.id && p.slug);
}

function renderEntryHtml(entry) {
  if (entry?.html && entry.html.trim()) return entry.html;
  if (typeof entry?.content === 'string' && /<[^>]+>/.test(entry.content)) return entry.content;
  return (entry?.text ?? '').replace(/\n/g, '<br/>');
}

function sortEntries(entries = []) {
  const list = Array.isArray(entries) ? [...entries] : [];
  list.sort((a, b) => {
    const aKey = a?.createdAt || a?.updatedAt || `${a?.date ?? ''}T00:00:00`;
    const bKey = b?.createdAt || b?.updatedAt || `${b?.date ?? ''}T00:00:00`;
    return aKey > bKey ? -1 : aKey < bKey ? 1 : 0;
  });
  return list;
}

export default function SectionPageRoom() {
  const { sectionSlug, pageSlug, tab } = useParams();
  const activeTab = (tab || 'journal').toLowerCase();
  const displaySection = (sectionSlug || '').replace(/-/g, ' ');
  const { token, isAuthenticated } = useContext(AuthContext);

  const [loading, setLoading] = useState(true);
  const [pages, setPages] = useState([]);
  const [page, setPage] = useState(null);
  const [entries, setEntries] = useState([]);
  const [error, setError] = useState('');
  const [newText, setNewText] = useState('');
  const [composing, setComposing] = useState(false);

  useEffect(() => {
    if (!token || !sectionSlug) return;
    let ignore = false;

    async function load() {
      setLoading(true);
      setError('');
      try {
        const res = await axios.get(`/api/section-pages/by-section/${encodeURIComponent(sectionSlug)}`);
        const list = normalizePageList(res.data?.items || res.data);
        if (ignore) return;
        setPages(list);

        const found = list.find((p) => p.slug === pageSlug) || null;
        setPage(found);

        if (!found) {
          setEntries([]);
          return;
        }

        const entryRes = await axios.get(`/api/entries?sectionPageId=${encodeURIComponent(found.id)}&limit=100`);
        if (ignore) return;
        const entryList = Array.isArray(entryRes.data) ? entryRes.data : [];
        setEntries(entryList);
      } catch (err) {
        if (ignore) return;
        console.warn('SectionPageRoom load failed:', err?.response?.data || err.message);
        setPages([]);
        setEntries([]);
        setError(err?.response?.data?.error || 'Failed to load section page');
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    load();
    return () => {
      ignore = true;
    };
  }, [token, sectionSlug, pageSlug]);

  async function handleAddEntry(e) {
    e.preventDefault();
    if (!page || !newText.trim()) return;
    try {
      setComposing(true);
      const payload = {
        text: newText,
        section: sectionSlug,
        sectionPageId: page.id,
        date: todayISO(),
      };
      const resp = await axios.post('/api/entries', payload);
      setEntries((prev) => [resp.data, ...prev]);
      setNewText('');
    } catch (err) {
      console.warn('Add entry failed:', err?.response?.data || err.message);
      setError(err?.response?.data?.error || 'Could not create entry');
    } finally {
      setComposing(false);
    }
  }

  const sortedEntries = useMemo(() => sortEntries(entries), [entries]);
  const motifs = useMemo(() => {
    const recent = sortedEntries.slice(0, 30);
    const tagCounts = {};
    const moodCounts = {};
    for (const entry of recent) {
      if (Array.isArray(entry.tags)) {
        for (const tag of entry.tags) {
          if (!tag) continue;
          tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        }
      }
      if (entry.mood) {
        moodCounts[entry.mood] = (moodCounts[entry.mood] || 0) + 1;
      }
    }
    return {
      tags: Object.entries(tagCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([tag, count]) => ({ tag, count })),
      moods: Object.entries(moodCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([mood, count]) => ({ mood, count })),
    };
  }, [sortedEntries]);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (!ALLOWED_TABS.includes(activeTab)) {
    return <Navigate to={`/sections/${sectionSlug}/${pageSlug || ''}/journal`} replace />;
  }

  const displayPageTitle = page ? page.title : (pageSlug || '').replace(/-/g, ' ') || 'Page';
  const displayPageIcon = page?.icon || '📄';
  const baseTabSlug = pageSlug || pages[0]?.slug || '';
  const canNavigateTabs = Boolean(baseTabSlug);

  return (
    <div className="sections-page sections-room">
      <aside className="sections-sidebar">
        <div className="sidebar-head">
          <h2>{displaySection || 'Section'}</h2>
          <span className="sidebar-count">{loading ? '…' : `${pages.length}`}</span>
        </div>

        {loading && <div className="muted">Loading…</div>}
        {!loading && pages.length === 0 && <div className="empty">No pages yet. Create one from the section builder.</div>}

        {pages.length > 0 && (
          <nav className="pages-nav">
            {pages.map((p) => {
              const active = p.slug === pageSlug;
              return (
                <Link
                  key={p.id}
                  to={`/sections/${sectionSlug}/${p.slug}/${activeTab}`}
                  className={`page-nav-item ${active ? 'active' : ''}`}
                >
                  <span className="emoji" aria-hidden="true">{p.icon || '📄'}</span>
                  <span>{p.title}</span>
                </Link>
              );
            })}
          </nav>
        )}
      </aside>

      <main className="sections-main">
        <div className="sections-detail">
          <header className="sections-header">
            <div className="title">
              <h1>{`${displayPageIcon} ${displayPageTitle}`}</h1>
              <div className="subtitle">{displaySection || 'Section'} · {pages.length || 'No'} page{pages.length === 1 ? '' : 's'}</div>
            </div>
            <nav className="tab-group" role="tablist">
              {ALLOWED_TABS.map((tabName) => {
                const label = tabName.replace('-', ' ');
                const className = `tab ${activeTab === tabName ? 'active' : ''} ${canNavigateTabs ? '' : 'disabled'}`;
                return canNavigateTabs ? (
                  <Link
                    key={tabName}
                    to={`/sections/${sectionSlug}/${baseTabSlug}/${tabName}`}
                    className={className.trim()}
                    role="tab"
                  >
                    {label}
                  </Link>
                ) : (
                  <span key={tabName} className={className.trim()} role="tab" aria-disabled="true">
                    {label}
                  </span>
                );
              })}
            </nav>
          </header>

          {error && <div className="callout error">{error}</div>}
          {loading && <div className="loading">Loading…</div>}

          {!loading && !page && pages.length > 0 && (
            <div className="callout">Pick a page from the left to open its journal.</div>
          )}

          {activeTab === 'journal' && page && (
            <>
              <form className="journal-composer" onSubmit={handleAddEntry}>
                <textarea
                  placeholder={`New journal entry in ${page.title}…`}
                  value={newText}
                  onChange={(e) => setNewText(e.target.value)}
                  rows={4}
                  disabled={!page}
                />
                <div className="journal-composer-actions">
                  <button type="submit" className="button" disabled={composing || !newText.trim() || !page}>
                    {composing ? 'Saving…' : 'Add entry'}
                  </button>
                </div>
              </form>

              <div className="entries-stack">
                {sortedEntries.length === 0 ? (
                  <div className="empty">No entries yet. Write your first one above.</div>
                ) : (
                  sortedEntries.map((entry) => (
                    <article className="entry-card" key={entry._id}>
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
            </>
          )}

          {activeTab === 'journal' && !page && !loading && pages.length === 0 && (
            <div className="empty">Create a page for this section to start journaling.</div>
          )}

          {activeTab !== 'journal' && (
            <div className="callout">
              “{activeTab.replace('-', ' ')}” is coming online soon. Capture your notes in Journal for now.
            </div>
          )}
        </div>
      </main>

      <aside className="sections-rail">
        <TaskList
          view="today"
          section={sectionSlug}
          header={`Today in “${displaySection || sectionSlug || 'this section'}”`}
          wrap={false}
        />

        <div className="motif-stack">
          <h3>Recent motifs</h3>
          {sortedEntries.length === 0 ? (
            <p className="muted">No trends yet.</p>
          ) : (
            <>
              {motifs.tags.length > 0 && (
                <div className="motif-group">
                  <span className="label">Top tags</span>
                  <div className="motif-pills">
                    {motifs.tags.map(({ tag, count }) => (
                      <span key={tag} className="pill pill-muted">#{tag} ×{count}</span>
                    ))}
                  </div>
                </div>
              )}
              {motifs.moods.length > 0 && (
                <div className="motif-group">
                  <span className="label">Top moods</span>
                  <div className="motif-pills">
                    {motifs.moods.map(({ mood, count }) => (
                      <span key={mood} className="pill">{mood} ×{count}</span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
