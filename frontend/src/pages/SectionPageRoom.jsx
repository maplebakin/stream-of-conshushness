// frontend/src/pages/SectionPageRoom.jsx
import React, { useContext, useEffect, useMemo, useState } from 'react';
import { useParams, Link, Navigate } from 'react-router-dom';
import axios from '../api/axiosInstance';
import { AuthContext } from '../AuthContext.jsx';
import '../Main.css';

/* -------------------------- Tiny helpers -------------------------- */
function todayISO() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
function buildEntryTimeline(entries) {
  const items = (Array.isArray(entries) ? entries : []).map(e => ({
    type: 'entry',
    id: e._id,
    timelineDate: e.createdAt || e.date || '1970-01-01',
    data: e
  }));
  items.sort((a, b) => (a.timelineDate > b.timelineDate ? -1 : a.timelineDate < b.timelineDate ? 1 : 0));
  return items;
}

/* ------------------------------ Page ------------------------------ */
export default function SectionPageRoom() {
  const { token } = useContext(AuthContext);
  const { sectionSlug, pageSlug, tab } = useParams();
  const activeTab = (tab || 'journal').toLowerCase();
  const allowedTabs = ['journal', 'manual', 'progress', 'gift-guide'];

  // Left spine (pages list), current page record, and page-scoped entries
  const [pages, setPages] = useState([]);
  const [page, setPage] = useState(null);
  const [entries, setEntries] = useState([]);

  const [loading, setLoading] = useState(true);
  const [composing, setComposing] = useState(false);
  const [newText, setNewText] = useState('');

  useEffect(() => {
    if (!token || !sectionSlug || !pageSlug) return;

    const run = async () => {
      setLoading(true);
      try {
        // 1) Left spine: pages under this section
        let list = [];
        try {
          const res = await axios.get(`/api/section-pages?section=${encodeURIComponent(sectionSlug)}`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          list = Array.isArray(res.data) ? res.data : [];
        } catch {
          const res = await axios.get(`/api/section-pages/${encodeURIComponent(sectionSlug)}`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          list = Array.isArray(res.data) ? res.data : [];
        }

        const normalized = list.map(p => ({
          id: p._id,
          title: p.title || p.name || p.slug || 'Untitled',
          slug: p.slug || (p.title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
          emoji: p.emoji || ''
        }));
        setPages(normalized);

        // 2) Resolve current page by slug from the list (no separate fetch needed)
        const found = normalized.find(p => p.slug === pageSlug);
        setPage(found || null);

        // 3) Entries scoped to this page (only if page found)
        if (found) {
          const resE = await axios.get(`/api/entries?sectionPageId=${encodeURIComponent(found.id)}&limit=100`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          setEntries(Array.isArray(resE.data) ? resE.data : []);
        } else {
          setEntries([]);
        }
      } catch (e) {
        console.warn('SectionPageRoom load failed:', e?.response?.data || e.message);
      } finally {
        setLoading(false);
      }
    };

    run();
  }, [token, sectionSlug, pageSlug]);

  // Redirect if someone hits a bad tab
  if (!allowedTabs.includes(activeTab)) {
    return <Navigate to={`/sections/${sectionSlug}/${pageSlug}/journal`} replace />;
  }

  // Build timeline (entries-first only for now)
  const timeline = useMemo(() => buildEntryTimeline(entries), [entries]);

  // Quick add entry (auto-binds sectionPageId!)
  async function handleAddEntry(e) {
    e.preventDefault();
    if (!page || !newText.trim()) return;
    try {
      setComposing(true);
      const resp = await axios.post(
        '/api/entries',
        { text: newText, sectionPageId: page.id },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setNewText('');
      // optimistic prepend
      setEntries(prev => [resp.data, ...prev]);
    } catch (err) {
      console.warn('Add entry failed:', err?.response?.data || err.message);
    } finally {
      setComposing(false);
    }
  }

  // Motifs from last 30 entries (simple client aggregate)
  const motifs = useMemo(() => {
    const recent = entries.slice(0, 30);
    const tagCounts = {};
    const moodCounts = {};
    for (const e of recent) {
      if (Array.isArray(e.tags)) e.tags.forEach(t => (tagCounts[t] = (tagCounts[t] || 0) + 1));
      if (e.mood) moodCounts[e.mood] = (moodCounts[e.mood] || 0) + 1;
    }
    const topTags = Object.entries(tagCounts).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([tag,count])=>({tag,count}));
    const topMoods = Object.entries(moodCounts).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([mood,count])=>({mood,count}));
    return { tags: topTags, moods: topMoods };
  }, [entries]);

  const gridStyle = {
    display: 'grid',
    gridTemplateColumns: '260px 1fr 320px',
    gap: '1rem',
    alignItems: 'start'
  };

  const pageTitle = page ? page.title : pageSlug.replace(/-/g, ' ');

  return (
    <div className="page" style={gridStyle}>
      {/* Left spine: pages under section */}
      <aside className="card" style={{ position: 'sticky', top: 16, height: 'fit-content' }}>
        <h3 style={{ marginTop: 0, textTransform: 'capitalize' }}>{sectionSlug}</h3>
        {pages.length === 0 ? (
          <div className="muted">No pages yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {pages.map(p => {
              const active = p.slug === pageSlug;
              return (
                <Link
                  key={p.id}
                  to={`/sections/${sectionSlug}/${p.slug}/journal`}
                  className={`px-3 py-2 rounded-button ${active ? 'bg-plum text-mist' : 'text-ink hover:bg-thread hover:text-mist'}`}
                >
                  {p.emoji ? `${p.emoji} ` : ''}{p.title}
                </Link>
              );
            })}
          </div>
        )}
      </aside>

      {/* Center: header + tabs + (journal) feed */}
      <main>
        <div className="card" style={{ marginBottom: '1rem' }}>
          <div className="section-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <h2 style={{ margin: 0 }}>{pageTitle}</h2>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 8 }}>
              {['journal','manual','progress','gift-guide'].map(t => (
                <Link
                  key={t}
                  to={`/sections/${sectionSlug}/${pageSlug}/${t}`}
                  className={`pill ${t === activeTab ? '' : 'pill-muted'}`}
                >
                  {t.replace('-', ' ')}
                </Link>
              ))}
            </div>
          </div>

          {/* Journal tab: quick add + feed */}
          {activeTab === 'journal' && (
            <>
              <form onSubmit={handleAddEntry} style={{ marginTop: 12 }}>
                <textarea
                  className="input"
                  placeholder={`New journal entry in ${pageTitle}…`}
                  value={newText}
                  onChange={e => setNewText(e.target.value)}
                  rows={3}
                  style={{ width: '100%' }}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                  <button type="submit" className="button" disabled={composing || !newText.trim()}>
                    {composing ? 'Saving…' : 'Add Entry'}
                  </button>
                </div>
              </form>

              <div style={{ marginTop: 12 }}>
                {loading ? (
                  <div>Loading…</div>
                ) : entries.length === 0 ? (
                  <div className="muted">No entries yet. Write your first one above.</div>
                ) : (
                  buildEntryTimeline(entries).map(item => (
                    <article className="entry-card" key={item.id} style={{ paddingTop: 8 }}>
                      <div className="entry-meta">
                        <span className="date">{item.data.date}</span>
                        {item.data.mood && <span className="pill">{item.data.mood}</span>}
                        {Array.isArray(item.data.tags) &&
                          item.data.tags.slice(0,5).map((t,i) => (
                            <span key={i} className="pill pill-muted">#{t}</span>
                          ))}
                      </div>
                      <div className="entry-text">
                        {item.data.text || (item.data.html ? <span dangerouslySetInnerHTML={{ __html: item.data.html }} /> : '—')}
                      </div>
                    </article>
                  ))
                )}
              </div>
            </>
          )}

          {/* Placeholder content for other tabs (MVP) */}
          {activeTab !== 'journal' && (
            <div className="muted" style={{ marginTop: 8 }}>
              “{activeTab.replace('-', ' ')}” tab is coming online soon. For now, use Journal to capture notes.
            </div>
          )}
        </div>
      </main>

      {/* Right: Motifs (we’ll add Today/Up Next when tasks/appts are page-scoped) */}
      <aside className="card" style={{ position: 'sticky', top: 16, height: 'fit-content' }}>
        <h3 style={{ marginTop: 0 }}>Recent motifs</h3>
        {entries.length === 0 ? (
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
