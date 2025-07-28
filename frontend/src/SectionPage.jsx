import { useParams, Link } from 'react-router-dom';
import { useState, useEffect, useContext } from 'react';
import axios from './api/axiosInstance';
import { AuthContext } from './AuthContext.jsx';
import Header from './Header.jsx';
import SectionSidebar from './SectionSidebar.jsx';
import Sidebar from './Sidebar.jsx';
import './Main.css';

export default function SectionPage() {
  const { sectionName } = useParams();
  const { token } = useContext(AuthContext);
  const [entries, setEntries] = useState([]);
  const [games, setGames] = useState([]);
  const [pages, setPages] = useState([]);
  const [loading, setLoading] = useState(true);

  const normalizedSection = sectionName.toLowerCase();
  const isGames = normalizedSection === 'games';

  useEffect(() => {
    if (!token || !sectionName) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        // Fetch entries for this section
        const entryRes = await axios.get(`/api/entries?section=${normalizedSection}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        const rawEntries = Array.isArray(entryRes.data) ? entryRes.data : [];

        const grouped = rawEntries.reduce((acc, entry) => {
          if (!acc[entry.date]) acc[entry.date] = [];
          acc[entry.date].push(entry);
          return acc;
        }, {});

        const groupedSorted = Object.entries(grouped)
          .sort((a, b) => new Date(b[0]) - new Date(a[0]))
          .map(([date, entries]) => [
            date,
            entries.sort((a, b) => new Date(b.createdAt || b._id) - new Date(a.createdAt || a._id)),
          ]);

        setEntries(groupedSorted);

        // If it's the Games section, load games
        if (isGames) {
          const gameRes = await axios.get('/api/games', {
            headers: { Authorization: `Bearer ${token}` },
          });
          setGames(Array.isArray(gameRes.data) ? gameRes.data : []);
        } else {
          setGames([]);
        }

        // Load custom pages for this section
        const pageRes = await axios.get(`/api/section-pages?section=${normalizedSection}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setPages(Array.isArray(pageRes.data) ? pageRes.data : []);

      } catch (err) {
        console.error('❌ Error loading section data:', err);
        setEntries([]);
        setGames([]);
        setPages([]);
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
        <SectionSidebar sectionName={sectionName} games={games} pages={pages} />

        <div className="main-feed">
          {entries.length === 0 ? (
            <p>No entries found for this section.</p>
          ) : (
            entries.map(([date, dayEntries]) => (
              <div key={date} className="entry-day-group">
                <h3>{date}</h3>
                {dayEntries.map((entry) => (
                  <div key={entry._id} className="entry-card">
                    <div
                      className="entry-content"
                      dangerouslySetInnerHTML={{ __html: entry.content }}
                    />
                    {entry.tags?.length > 0 && (
                      <div className="tags">
                        {entry.tags.map((tag) => (
                          <span key={tag} className="tag-pill">#{tag}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))
          )}
        </div>

        {!isGames && <Sidebar sectionName={sectionName} />}
      </div>
    </>
  );
}
