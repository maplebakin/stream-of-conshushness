import { useContext, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import axios from '../api/axiosInstance.js';
import { AuthContext } from '../AuthContext.jsx';
import TaskList from '../adapters/TaskList.default.jsx';
import SafeHTML from '../components/SafeHTML.jsx';
import '../Main.css';

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
      slug: p.slug || (p.title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''),
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

  return (
    <div className="page" style={{ display: 'grid', gridTemplateColumns: '260px 1fr 320px', gap: '1rem', alignItems: 'start' }}>
      <aside className="card" style={{ position: 'sticky', top: 16, height: 'fit-content' }}>
        <h3 style={{ marginTop: 0, textTransform: 'capitalize' }}>{sectionSlug}</h3>
        {pages.length === 0 && !loading && <div className="muted">No pages yet.</div>}
        {pages.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {pages.map((p) => {
              const active = p.slug === pageSlug;
              return (
                <Link
                  key={p.id}
                  to={`/sections/${sectionSlug}/${p.slug}/${activeTab}`}
                  className={`px-3 py-2 rounded-button ${active ? 'bg-plum text-mist' : 'text-ink hover:bg-thread hover:text-mist'}`}
                  style={{ borderRadius: 10, textDecoration: 'none' }}
                >
                  {p.icon ? `${p.icon} ` : ''}{p.title}
                </Link>
              );
            })}
          </div>
        )}
      </aside>

      <main>
        <div className="card" style={{ marginBottom: '1rem' }}>
          <div className="section-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <h2 style={{ margin: 0 }}>{page ? page.title : (pageSlug || '').replace(/-/g, ' ')}</h2>
            <div style={{ display: 'flex', gap: 8 }}>
              {ALLOWED_TABS.map((tabName) => (
                <Link
                  key={tabName}
                  to={`/sections/${sectionSlug}/${pageSlug || ''}/${tabName}`}
                  className={`pill ${tabName === activeTab ? '' : 'pill-muted'}`}
                >
                  {tabName.replace('-', ' ')}
                </Link>
              ))}
            </div>
          </div>

          {error && <div className="pill" style={{ background: 'rgba(255,145,145,.12)', borderColor: 'rgba(255,145,145,.35)' }}>{error}</div>}

          {!loading && !error && !page && pages.length > 0 && (
            <div className="muted" style={{ marginTop: 8 }}>
              Select a page from the sidebar to see its journal.
            </div>
          )}

          {activeTab === 'journal' && (
            <>
              <form onSubmit={handleAddEntry} style={{ marginTop: 12 }}>
                <textarea
                  className="input"
                  placeholder={`New journal entry in ${page ? page.title : 'this page'}…`}
                  value={newText}
                  onChange={(e) => setNewText(e.target.value)}
                  rows={3}
                  style={{ width: '100%' }}
                  disabled={!page}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                  <button type="submit" className="button" disabled={composing || !newText.trim() || !page}>
                    {composing ? 'Saving…' : 'Add Entry'}
                  </button>
                </div>
              </form>

              <div style={{ marginTop: 12 }}>
                {loading ? (
                  <div>Loading…</div>
                ) : sortedEntries.length === 0 ? (
                  <div className="muted">No entries yet. Write your first one above.</div>
                ) : (
                  sortedEntries.map((entry) => (
                    <article className="entry-card" key={entry._id} style={{ paddingTop: 8 }}>
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

          {activeTab !== 'journal' && (
            <div className="muted" style={{ marginTop: 8 }}>
              “{activeTab.replace('-', ' ')}” is coming online soon. Capture your notes in Journal for now.
            </div>
          )}
        </div>
      </main>

      <aside className="card" style={{ position: 'sticky', top: 16, height: 'fit-content' }}>
        <TaskList
          view="today"
          section={sectionSlug}
          header={`Today in “${sectionSlug.replace(/-/g, ' ')}”`}
          wrap={false}
        />

        <h3 style={{ marginTop: 16 }}>Recent motifs</h3>
        {sortedEntries.length === 0 ? (
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
      </aside>
    </div>
  );
}
