import { useParams, Link } from 'react-router-dom';
import { useEffect, useState, useContext } from 'react';
import axios from './api/axiosInstance';
import { AuthContext } from './AuthContext.jsx';

export default function SectionPage() {
  const { sectionName } = useParams();
  const { token, logout } = useContext(AuthContext);

  const [entries, setEntries] = useState([]);
  const [fullEntryList, setFullEntryList] = useState([]);
  const [games, setGames] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch full entry list (for sidebar) and section-specific entries
  useEffect(() => {
    if (!token) return;

    // Fetch all entries for sidebar data
    axios.get('/api/entries', {
      headers: { Authorization: `Bearer ${token}` },
    }).then((res) => {
      setFullEntryList(res.data);
    });

    // Fetch only entries that match this section
    axios.get('/api/entries', {
      headers: { Authorization: `Bearer ${token}` },
    }).then((res) => {
      const filtered = res.data.filter((e) =>
        e.section?.toLowerCase().replace(/\s+/g, '-') === sectionName
      );
      setEntries(filtered);
    });

    // Load games if on games section
    if (sectionName === 'games') {
      axios.get('/api/games', {
        headers: { Authorization: `Bearer ${token}` },
      }).then((res) => setGames(res.data));
    }
  }, [token, sectionName]);

  const allTags = Array.from(
    new Set(
      fullEntryList
        .flatMap((e) =>
          Array.isArray(e.tags) ? e.tags : (e.tags || '').split(',')
        )
        .map((t) => t.trim())
        .filter((t) => t.length > 0)
    )
  ).sort();

  const allSections = Array.from(
    new Set(fullEntryList.map((entry) => entry.section).filter(Boolean))
  ).sort();

  const filteredEntries = entries.filter((entry) => {
    const normalizedSearch = searchQuery.replace(/^#/, '').toLowerCase();
    const matchesSearch =
      !normalizedSearch ||
      (entry.content && entry.content.toLowerCase().includes(normalizedSearch)) ||
      (entry.date && entry.date.toLowerCase().includes(normalizedSearch)) ||
      (entry.section && entry.section.toLowerCase().includes(normalizedSearch)) ||
      (Array.isArray(entry.tags) &&
        entry.tags.join(', ').toLowerCase().includes(normalizedSearch));
    return matchesSearch;
  });

  return (
    <>
      <header>
        <h1>Stream of Conshushness</h1>
        <nav>
          <Link to="/">The Stream</Link>
          <Link to="/calendar">📅 Calendar</Link>
          <button onClick={logout}>Log Out</button>
        </nav>
      </header>

      <div className="main-container">
        <section className="main-feed">
          <h2>{sectionName.replace(/-/g, ' ')}</h2>
          {filteredEntries.length === 0 && <p>No entries found.</p>}
          {filteredEntries.map((entry) => (
            <div key={entry._id} className="main-entry">
              <h3>{entry.date}</h3>
              <h4>{entry.section}</h4>
              <div
                className="entry-content"
                dangerouslySetInnerHTML={{ __html: entry.content }}
              />
              {entry.tags && entry.tags.length > 0 && (
                <div className="tags">
                  {[...new Set(
                    (Array.isArray(entry.tags) ? entry.tags : entry.tags.split(','))
                      .map((tag) => tag.trim())
                      .filter(Boolean)
                  )].map((tag, i) => (
                    <span key={`${entry._id}-tag-${i}`} className="tag-pill">
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}

          {sectionName === 'games' && (
            <div className="game-library">
              <h2>🎮 Game Library</h2>
              <div className="game-list">
                {games.map((game) => (
                  <div key={game._id} className="game-card">
                    <Link to={`/section/games/${game.slug}`}>{game.title}</Link>
                    {game.description && <p>{game.description}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        <aside className="main-sidebar">
          <input
            type="text"
            id="search"
            placeholder="Search…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <div className="calendar">
            <Link to="/calendar">📅 Open Calendar</Link>
            <Link to="/" className="back-to-stream">← Back to the Stream</Link>

          </div>
          <div className="sections">
            {allSections.map((section) => (
              <Link
                key={section}
                to={`/section/${section.toLowerCase().replace(/\s+/g, '-')}`}
              >
                {section}
              </Link>
            ))}
          </div>
        </aside>
      </div>

      <footer id="tag-footer">
        {allTags.map((tag) => (
          <a
            key={`tag-footer-${tag}`}
            href="#"
            className={searchQuery === tag ? 'active' : ''}
            onClick={(e) => {
              e.preventDefault();
              setSearchQuery(tag);
            }}
          >
            #{tag}
          </a>
        ))}
      </footer>
    </>
  );
}
