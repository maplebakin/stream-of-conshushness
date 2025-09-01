// frontend/src/pages/SectionPage.jsx
import { useParams } from 'react-router-dom';
import { useState, useEffect, useContext, useMemo } from 'react';
import axios from '../api/axiosInstance';
import { AuthContext } from '../AuthContext.jsx';
import TaskList from '../adapters/TaskList.default.jsx';
import '../Main.css';
import SafeHTML from '../components/SafeHTML.jsx'; // (top of file)

export default function SectionPage() {
  const params = useParams();
  // Accept either /sections/:key (new) or /sections/:sectionName (old)
  const sectionKey = (params.key || params.sectionName || '').toLowerCase();

  const { token } = useContext(AuthContext);
  const [entries, setEntries] = useState([]);
  const [pages, setPages] = useState([]);
  const [allSections, setAllSections] = useState([]);
  const [loading, setLoading] = useState(true);

  // entries-first filter toggles (default: entries on)
  const [showEntries, setShowEntries] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);
      try {
        // Always fetch the list so landing can render something when no key
        const sec = await axios.get('/api/sections');
        if (!cancelled) setAllSections(Array.isArray(sec.data) ? sec.data : []);

        if (!sectionKey) return; // landing mode only

        // Entries for this section
        const entryRes = await axios.get(`/api/entries?section=${encodeURIComponent(sectionKey)}&limit=100`);
        if (!cancelled) setEntries(Array.isArray(entryRes.data) ? entryRes.data : []);

        // Custom pages for this section
        const pagesRes = await axios.get(`/api/section-pages/${encodeURIComponent(sectionKey)}`);
        if (!cancelled) setPages(Array.isArray(pagesRes.data) ? pagesRes.data : []);
      } catch (e) {
        console.warn('SectionPage fetch error:', e?.response?.data || e.message);
        if (!cancelled) {
          if (!sectionKey) setAllSections([]);
          setEntries([]);
          setPages([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    if (token) run();
    return () => { cancelled = true; };
  }, [token, sectionKey]);

  const title = sectionKey ? sectionKey.replace(/-/g, ' ') : 'Sections';

  const sortedSections = useMemo(() => {
    return (allSections || [])
      .map(s => ({
        key: s.key || s.slug || '',
        label: s.label || s.name || s.key || '',
        emoji: s.icon || s.emoji || '📚',
        pinned: !!s.pinned,
        order: Number.isFinite(s.order) ? s.order : 0,
      }))
      .filter(s => s.key)
      .sort((a,b) => (a.pinned !== b.pinned) ? (a.pinned ? -1:1) : (a.order - b.order) || a.label.localeCompare(b.label));
  }, [allSections]);

  if (!sectionKey) {
    // Landing view
    return (
      <div className="page">
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="section-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <h2 style={{ margin: 0 }}>{title}</h2>
          </div>
          {loading ? (
            <div>Loading…</div>
          ) : sortedSections.length === 0 ? (
            <p className="muted">No sections yet. Create one in the Clusters view or via API.</p>
          ) : (
            <ul className="unstyled" style={{ columns: 2, columnGap: 16, maxWidth: 720 }}>
              {sortedSections.map(s => (
                <li key={s.key} style={{ breakInside: 'avoid', marginBottom: 8 }}>
                  <a href={`/sections/${encodeURIComponent(s.key)}`} className="link">
                    <span style={{ marginRight: 6 }}>{s.emoji}</span>{s.label}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  // Detail view
  return (
    <div className="page two-col with-sidebar">
      <main className="content">
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="section-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <h2 style={{ margin: 0, textTransform: 'capitalize' }}>{title}</h2>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className={`pill ${showEntries ? '' : 'pill-muted'}`} onClick={() => setShowEntries(v => !v)}>
                Entries
              </button>
              <a className="pill" href={`/sections/${encodeURIComponent(sectionKey)}#pages`}>Pages</a>
            </div>
          </div>
          {loading ? (
            <div>Loading…</div>
          ) : showEntries ? (
            entries.length === 0 ? (
              <p className="muted">No entries yet for this section.</p>
            ) : (
              entries.map(e => (
                <article className="entry-card" key={e._id}>
                  <div className="entry-meta">
                    <span className="date">{e.date}</span>
                    {e.mood && <span className="pill">{e.mood}</span>}
                    {Array.isArray(e.tags) && e.tags.slice(0,5).map((t,i) => (
                      <span key={i} className="pill pill-muted">#{t}</span>
                    ))}
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
                </article>
              ))
            )
          ) : null}
        </div>

        <div className="card" id="pages">
          <h3 style={{ marginTop: 0 }}>Pages</h3>
          {loading ? (
            <div>Loading…</div>
          ) : pages.length === 0 ? (
            <p className="muted">No pages yet.</p>
          ) : (
            <ul className="unstyled">
              {pages.map(p => (
                <li key={p._id}>
                  <a className="link" href={`/sections/${encodeURIComponent(sectionKey)}/${encodeURIComponent(p.slug)}`}>
                    {p.icon || '📄'} {p.title}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>

      {/* Sidebar: tasks in this section */}
      {token && (
        <aside className="sidebar">
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Tasks in “{title}”</h3>
            {/* TaskList now supports `section` filtering */}
            <TaskList view="today" section={sectionKey} />
          </div>
        </aside>
      )}
    </div>
  );
}
