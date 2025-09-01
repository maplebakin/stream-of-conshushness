// SectionSidebar.jsx
import { useState, useEffect, useContext } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import axios from './api/axiosInstance';
import { AuthContext } from './AuthContext.jsx';
import './Sidebar.css';

function slugify(s = '') {
  return String(s)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80);
}

export default function SectionSidebar() {
  const { sectionSlug } = useParams(); // ← matches /sections/:sectionSlug/…
  const navigate = useNavigate();
  const { token } = useContext(AuthContext);

  const [pages, setPages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [creating, setCreating] = useState(false);

  // load pages under this section
  useEffect(() => {
    if (!token || !sectionSlug) return;
    let cancelled = false;

    async function run() {
      setLoading(true);
      setErr('');
      try {
        const headers = { Authorization: `Bearer ${token}` };
        let list = [];

        // primary endpoint
        try {
          const res = await axios.get(`/api/section-pages?section=${encodeURIComponent(sectionSlug)}`, { headers });
          list = Array.isArray(res.data) ? res.data : [];
        } catch {
          // fallback legacy endpoint
          const res = await axios.get(`/api/section-pages/${encodeURIComponent(sectionSlug)}`, { headers });
          list = Array.isArray(res.data) ? res.data : [];
        }

        if (!cancelled) {
          // normalize minimal fields used here
          const normalized = list.map(p => ({
            _id: p._id,
            slug: p.slug || slugify(p.title || 'untitled'),
            title: p.title || p.name || p.slug || 'Untitled',
            emoji: p.icon || p.emoji || ''
          }));
          normalized.sort((a, b) => a.title.localeCompare(b.title));
          setPages(normalized);
        }
      } catch (e) {
        if (!cancelled) setErr(e?.response?.data?.error || 'Failed to load pages.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => { cancelled = true; };
  }, [token, sectionSlug]);

  async function handleCreatePage(e) {
    e.preventDefault();
    if (!newTitle.trim() || !token || !sectionSlug) return;
    setCreating(true);
    setErr('');
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const slug = slugify(newTitle);
      const body = {
        sectionKey: sectionSlug,   // ← backend expects sectionKey
        slug,
        title: newTitle.trim(),
        body: newContent.trim()
      };
      const res = await axios.post('/api/section-pages', body, { headers });
      const created = res?.data || { _id: crypto.randomUUID(), slug, title: newTitle };

      setPages(prev => {
        const next = [{ _id: created._id, slug: created.slug || slug, title: created.title || newTitle, emoji: created.icon || '' }, ...prev];
        next.sort((a, b) => a.title.localeCompare(b.title));
        return next;
      });

      // reset form + jump into the new page (journal tab by default)
      setNewTitle('');
      setNewContent('');
      setShowForm(false);
      navigate(`/sections/${encodeURIComponent(sectionSlug)}/${encodeURIComponent(slug)}/journal`);
    } catch (e) {
      setErr(e?.response?.data?.error || 'Failed to create page.');
    } finally {
      setCreating(false);
    }
  }

  return (
    <aside className="sidebar card" style={{ position: 'sticky', top: 16, height: 'fit-content' }}>
      <h3 style={{ marginTop: 0, textTransform: 'capitalize' }}>
        {sectionSlug?.replace(/-/g, ' ')}
      </h3>

      {loading ? (
        <div className="muted">Loading…</div>
      ) : pages.length === 0 ? (
        <div className="muted" style={{ marginBottom: 8 }}>No pages yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
          {pages.map(p => {
            const url = `/sections/${encodeURIComponent(sectionSlug)}/${encodeURIComponent(p.slug)}/journal`;
            return (
              <Link
                key={p._id}
                to={url}
                className="px-3 py-2 rounded-button text-ink hover:bg-thread hover:text-mist"
                title={p.title}
              >
                {p.emoji ? `${p.emoji} ` : ''}{p.title}
              </Link>
            );
          })}
        </div>
      )}

      {err && <div className="auth-error" style={{ marginBottom: 8 }}>{err}</div>}

      {!showForm ? (
        <button className="btn ghost" onClick={() => setShowForm(true)}>➕ New Page</button>
      ) : (
        <form onSubmit={handleCreatePage} className="new-page-form" style={{ display: 'grid', gap: 8, marginTop: 8 }}>
          <input
            type="text"
            className="input"
            placeholder="Page title"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            disabled={creating}
            required
          />
          <textarea
            className="input"
            placeholder="Optional content"
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            rows={4}
            disabled={creating}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" className="button" disabled={creating || !newTitle.trim()}>
              {creating ? 'Creating…' : 'Create'}
            </button>
            <button type="button" className="btn ghost" onClick={() => { setShowForm(false); setNewTitle(''); setNewContent(''); }} disabled={creating}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </aside>
  );
}
