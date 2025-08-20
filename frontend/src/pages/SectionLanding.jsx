// frontend/src/pages/SectionLanding.jsx
import React, { useEffect, useState, useContext } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from '../api/axiosInstance';
import { AuthContext } from '../AuthContext.jsx';
import '../Main.css';

export default function SectionLanding() {
  const { sectionSlug } = useParams();
  const { token } = useContext(AuthContext);

  const [pages, setPages] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token || !sectionSlug) return;
    const run = async () => {
      setLoading(true);
      try {
        // Preferred: /api/section-pages?section=:sectionSlug
        let list = [];
        try {
          const res = await axios.get(`/api/section-pages?section=${encodeURIComponent(sectionSlug)}`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          list = Array.isArray(res.data) ? res.data : [];
        } catch {
          // Back-compat: /api/section-pages/:sectionSlug
          const res = await axios.get(`/api/section-pages/${encodeURIComponent(sectionSlug)}`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          list = Array.isArray(res.data) ? res.data : [];
        }
        // normalize
        setPages(list.map(p => ({
          id: p._id,
          title: p.title || p.name || p.slug || 'Untitled',
          slug: p.slug || (p.title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
          emoji: p.emoji || ''
        })));
      } catch (e) {
        console.warn('SectionLanding fetch failed:', e?.response?.data || e.message);
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [token, sectionSlug]);

  const gridStyle = {
    display: 'grid',
    gridTemplateColumns: '260px 1fr',
    gap: '1rem',
    alignItems: 'start'
  };

  return (
    <div className="page" style={gridStyle}>
      {/* Left spine: pages in this section */}
      <aside className="card" style={{ position: 'sticky', top: 16, height: 'fit-content' }}>
        <h3 style={{ marginTop: 0, textTransform: 'capitalize' }}>{sectionSlug}</h3>
        {loading ? (
          <div className="muted">Loading…</div>
        ) : pages.length === 0 ? (
          <p className="muted">No pages yet. Create one from a future “New Page” action.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {pages.map(p => (
              <Link
                key={p.id}
                to={`/sections/${sectionSlug}/${p.slug}/journal`}
                className="px-3 py-2 rounded-button text-ink hover:bg-thread hover:text-mist"
              >
                {p.emoji ? `${p.emoji} ` : ''}{p.title}
              </Link>
            ))}
          </div>
        )}
      </aside>

      {/* Center: a simple intro */}
      <main>
        <div className="card">
          <h2 style={{ marginTop: 0, textTransform: 'capitalize' }}>{sectionSlug}</h2>
          <p className="muted">
            Pick a page from the left to enter its room. Each page has tabs (Journal • Manual • Progress • Gift Guide).
          </p>
          {sectionSlug === 'games' && pages.length > 0 && (
            <p>Dev tip: try <Link to={`/sections/${sectionSlug}/${pages[0].slug}/journal`}>{pages[0].title} ▸ Journal</Link>.</p>
          )}
        </div>
      </main>
    </div>
  );
}
