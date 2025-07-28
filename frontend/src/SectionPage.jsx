import { useParams, Link } from 'react-router-dom';
import { useState, useEffect, useContext } from 'react';
import axios from './api/axiosInstance';
import { AuthContext } from './AuthContext.jsx';
import Header from './Header.jsx';
import Sidebar from './Sidebar.jsx';
import './Main.css';

export default function SectionPage() {
  const { sectionName } = useParams();
  const { token } = useContext(AuthContext);
  const [entries, setEntries] = useState([]);
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token || !sectionName) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        const entryRes = await axios.get(`/api/entries?section=${sectionName}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        const rawEntries = Array.isArray(entryRes.data) ? entryRes.data : [];

        const grouped = rawEntries.reduce((acc, entry) => {
          if (!acc[entry.date]) acc[entry.date] = [];
          acc[entry.date].push(entry);
          return acc;
        }, {});

        // Sort dates newest to oldest, and within each date, newest to oldest
        const groupedSorted = Object.entries(grouped)
          .sort((a, b) => new Date(b[0]) - new Date(a[0]))
          .map(([date, dayEntries]) => [
            date,
            dayEntries.sort((a, b) => new Date(b.createdAt || b._id) - new Date(a.createdAt || a._id))
          ]);

        setEntries(groupedSorted);

        if (sectionName.toLowerCase() === 'games') {
          const gameRes = await axios.get('/api/games', {
            headers: { Authorization: `Bearer ${token}` },
          });
          setGames(Array.isArray(gameRes.data) ? gameRes.data : []);
        } else {
          setGames([]);
        }
      } catch (err) {
        console.error('Error loading section data:', err);
        setEntries([]);
        setGames([]);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [token, sectionName]);

  if (loading) return <p className="section-page">Loading...</p>;

  return (
    <>
      <Header />
      <div className="main-container">
        <div className="main-feed">
          {entries.length === 0 ? (
            <p>No entries found for this section.</p>
          ) : (
            entries.map(([date, dayEntries]) => (
              <div key={date} className="entry-day-group">
                <h3>{date}</h3>
                {dayEntries.map(entry => (
                  <div key={entry._id} className="entry-card">
                    <div
                      className="entry-content"
                      dangerouslySetInnerHTML={{ __html: entry.content }}
                    />
                    {entry.tags?.length > 0 && (
                      <div className="tags">
                        {entry.tags.map(tag => (
                          <span key={tag} className="tag-pill">{tag}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))
          )}

          {sectionName.toLowerCase() === 'games' && (
            <>
              <h3 style={{ marginTop: '2rem' }}>🎮 Game List</h3>
              <div className="game-list">
                {games.length === 0 ? (
                  <p>No games added yet.</p>
                ) : (
                  games.map(game => (
                    <div key={game._id} className="game-card">
                      <Link to={`/section/games/${game.slug}`}>{game.title}</Link>
                      {game.description && <p>{game.description}</p>}
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>

        <Sidebar sectionName={sectionName} />
      </div>
    </>
  );
}
