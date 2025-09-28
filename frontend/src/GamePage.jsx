import { useParams } from 'react-router-dom';
import { useEffect, useState, useContext } from 'react';
import axios from './api/axiosInstance';
import { AuthContext } from './AuthContext.jsx';
import Header from './Header.jsx';
import SafeHTML from './components/SafeHTML.jsx'; // (top of file)

export default function GamePage() {
  const { slug } = useParams();
  const { token } = useContext(AuthContext);

  const [game, setGame] = useState(null);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Fetch game info and entries
  useEffect(() => {
    if (!token || !slug) return;
    setLoading(true);

    // Fetch game info
    axios.get(`/api/games/${slug}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => setGame(res.data))
      .catch(err => {
        console.warn('[GamePage] Failed to load game', err);
        setNotFound(true);
        setGame(null);
      });

    // Fetch entries linked to this game
    axios.get(`/api/entries?section=games&gameSlug=${slug}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => setEntries(Array.isArray(res.data) ? res.data : []))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, [token, slug]);

  if (notFound) return (
    <div className="empty-state" style={{ textAlign: 'center', padding: '2em' }}>
      <div style={{ fontSize: 48, opacity: 0.3 }}>🎮</div>
      <p>Game not found.</p>
    </div>
  );

  if (loading || !game) return (
    <div className="game-page" style={{ textAlign: 'center', padding: '2em' }}>
      <p>Loading game info…</p>
    </div>
  );

  return (
    <>
      <Header />
      <div className="main-container">
        <div className="main-feed">
          <h2>🎮 {game.title || slug.replace(/-/g, ' ')}</h2>
          {game.coverImage && (
            <img src={game.coverImage} alt={game.title} className="game-cover" />
          )}
          <div className="game-details" style={{ marginBottom: 24 }}>
            <p>{game.description}</p>
            {/* More details: genre, platform, your rating, etc */}
          </div>

          <h3>Game Journal Entries</h3>
          {entries.length === 0 ? (
            <div className="empty-state">
              <div style={{ fontSize: 36, opacity: 0.3 }}>🗃️</div>
              <p>No entries for this game yet.</p>
            </div>
          ) : (
            entries.map(entry => (
              <div className="entry-card" key={entry._id}>
                <h4>{entry.date}</h4>
                

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
                {entry.tags && (
                  <div className="tags">
                    {(Array.isArray(entry.tags) ? entry.tags : (entry.tags || '').split(','))
                      .map(tag => tag.trim())
                      .filter(Boolean)
                      .map(tag => (
                        <span className="tag" key={tag}>{tag}</span>
                      ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
