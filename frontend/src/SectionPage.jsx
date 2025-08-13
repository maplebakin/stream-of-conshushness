// src/SectionPage.jsx
import { useParams } from 'react-router-dom';
import { useState, useEffect, useContext } from 'react';
import axios from './api/axiosInstance';
import { AuthContext } from './AuthContext.jsx';
import SectionSidebar from './SectionSidebar.jsx';
import './Main.css';

export default function SectionPage() {
  const { sectionName } = useParams();
  const { token } = useContext(AuthContext);
  const [entries, setEntries] = useState([]);
  const [games, setGames] = useState([]);
  const [pages, setPages] = useState([]);
  const [loading, setLoading] = useState(true);

  const normalizedSection = (sectionName || '').toLowerCase();
  const isGames = normalizedSection === 'games';

  useEffect(() => {
    if (!token || !sectionName) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        // Entries for this section
        const entryRes = await axios.get(`/api/entries?section=${normalizedSection}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setEntries(entryRes.data || []);

        // Games & custom pages for "Games" section only
        if (isGames) {
          const gamesRes = await axios.get('/api/games', { headers: { Authorization: `Bearer ${token}` }});
          setGames(gamesRes.data || []);
        } else {
          setGames([]);
        }

        const pagesRes = await axios.get(`/api/section-pages/${normalizedSection}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setPages(pagesRes.data || []);
      } catch (e) {
        console.warn('SectionPage fetch error:', e?.response?.data || e.message);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [token, sectionName]);

  return (
    <div className="page two-col with-sidebar">
      {/* Left fixed sidebar for section navigation */}
      <aside className="static-sidebar">
        <SectionSidebar currentSection={normalizedSection} />
      </aside>

      {/* Main content area */}
      <main className="content">
        <div className="section-header">
          <h2 style={{ margin: 0, textTransform: 'capitalize' }}>{normalizedSection}</h2>
        </div>

        {loading && <div className="card">Loading…</div>}

        {!loading && (
          <>
            {/* Rolling entries */}
            <div className="card scrollable">
              <h3 style={{ marginTop: 0 }}>Entries</h3>
              {entries.length === 0 ? (
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
                    <div className="entry-text">{e.text}</div>
                  </article>
                ))
              )}
            </div>

            {/* Section-specific extras */}
            {isGames && (
              <div className="card">
                <h3 style={{ marginTop: 0 }}>Games</h3>
                {games.length === 0 ? (
                  <p className="muted">No games yet.</p>
                ) : (
                  <ul className="unstyled">
                    {games.map(g => (
                      <li key={g._id}>{g.title}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Custom pages */}
            <div className="card">
              <h3 style={{ marginTop: 0 }}>Pages</h3>
              {pages.length === 0 ? (
                <p className="muted">No pages yet.</p>
              ) : (
                <ul className="unstyled">
                  {pages.map(p => (
                    <li key={p._id}>{p.title}</li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
