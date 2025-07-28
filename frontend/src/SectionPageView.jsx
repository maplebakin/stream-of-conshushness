import { useParams } from 'react-router-dom';
import { useEffect, useState, useContext } from 'react';
import axios from './api/axiosInstance';
import { AuthContext } from './AuthContext.jsx';
import Header from './Header.jsx';

export default function SectionPageView() {
  const { sectionName, pageSlug } = useParams();
  const { token } = useContext(AuthContext);

  const [page, setPage] = useState(null);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  // Fetch page content
  useEffect(() => {
    if (!token || !pageSlug) return;
    axios
      .get(`/api/section-pages?section=${sectionName}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => {
        const match = res.data.find((p) => p.slug === pageSlug);
        if (match) setPage(match);
      })
      .catch((err) => {
        console.error('❌ Error loading section page:', err);
      });
  }, [token, sectionName, pageSlug]);

  // Fetch entries in this section
  useEffect(() => {
    if (!token || !sectionName) return;
    setLoading(true);
    axios
      .get(`/api/entries?section=${sectionName}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => {
        setEntries(Array.isArray(res.data) ? res.data : []);
      })
      .catch((err) => {
        console.error('❌ Error loading entries for section:', err);
      })
      .finally(() => setLoading(false));
  }, [token, sectionName]);

  if (!page) return <p>Loading page…</p>;

  return (
    <>
      <Header />
      <div className="main-container">
        <div className="left-sidebar">
          <h2>{page.title}</h2>
          <div dangerouslySetInnerHTML={{ __html: page.content }} />
        </div>
        <div className="entry-feed">
          {loading ? (
            <p>Loading entries…</p>
          ) : entries.length === 0 ? (
            <p>No entries in this section yet.</p>
          ) : (
            entries.map((entry) => (
              <div className="entry-card" key={entry._id}>
                <h4>{entry.date}</h4>
                <div dangerouslySetInnerHTML={{ __html: entry.content }} />
                {entry.tags && entry.tags.length > 0 && (
                  <div className="tags">
                    {entry.tags.map((tag) => (
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
