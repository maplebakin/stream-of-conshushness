import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useState, useContext } from 'react';
import axios from './api/axiosInstance';
import { AuthContext } from './AuthContext.jsx';
import Header from './Header.jsx';
import EntryModal from './EntryModal.jsx';
import './Main.css'; // or import './SectionPage.css' if you're splitting

export default function SectionPageView() {
  const { sectionName, pageSlug } = useParams();
  const { token } = useContext(AuthContext);
  const navigate = useNavigate();

  const [page, setPage] = useState(null);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pageNotFound, setPageNotFound] = useState(false);

  const [showEditModal, setShowEditModal] = useState(false);
  const [editEntry, setEditEntry] = useState(null);

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
        else setPageNotFound(true);
      })
      .catch((err) => {
        console.error('❌ Error loading section page:', err);
        setPageNotFound(true);
      });
  }, [token, sectionName, pageSlug]);

  // Fetch entries in this section
  const fetchEntries = () => {
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
  };

  useEffect(() => {
    fetchEntries();
    // eslint-disable-next-line
  }, [token, sectionName]);

  const handleDelete = async (entryId) => {
    if (!window.confirm('Delete this entry?')) return;
    try {
      await axios.delete(`/api/entries/${entryId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setEntries((prev) => prev.filter((e) => e._id !== entryId));
    } catch (err) {
      console.error('Error deleting entry:', err);
    }
  };

  const handleEditEntry = (entry) => {
    setEditEntry(entry);
    setShowEditModal(true);
  };

  const handleSaveEntry = () => {
    setShowEditModal(false);
    setEditEntry(null);
    fetchEntries();
  };

  if (pageNotFound) {
    return (
      <div className="empty-state" style={{ textAlign: 'center', padding: '2em' }}>
        <div style={{ fontSize: 48, opacity: 0.3 }}>📄</div>
        <p>Page not found.</p>
      </div>
    );
  }

  if (!page) return <p>Loading page…</p>;

  return (
    <>
      <Header />
      <div className="main-container">
        <div className="main-feed">
          <button
            className="section-back-button"
            onClick={() => navigate(`/section/${sectionName}`)}
          >
            ← Back to {sectionName}
          </button>

          <h2>{page.title}</h2>
          <div
            dangerouslySetInnerHTML={{ __html: page.content }}
            style={{ marginBottom: 24 }}
          />

          <h3>Entries in this section</h3>
          {loading ? (
            <p>Loading entries…</p>
          ) : entries.length === 0 ? (
            <div className="empty-state" style={{ textAlign: 'center', padding: '2em' }}>
              <div style={{ fontSize: 36, opacity: 0.3 }}>🗃️</div>
              <p>No entries in this section yet.</p>
            </div>
          ) : (
            entries.map((entry) => (
              <div className="entry-card" key={entry._id}>
                <h4>{entry.date}</h4>
                <div dangerouslySetInnerHTML={{ __html: entry.content }} />

                {entry.tags && (
                  <div className="tags">
                    {(Array.isArray(entry.tags) ? entry.tags : (entry.tags || '').split(','))
                      .map((tag) => tag.trim())
                      .filter(Boolean)
                      .map((tag) => (
                        <span className="tag" key={tag}>
                          {tag}
                        </span>
                      ))}
                  </div>
                )}

                <div className="main-entry-controls">
                  <button onClick={() => handleEditEntry(entry)}>Edit</button>
                  <button onClick={() => handleDelete(entry._id)}>Delete</button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <EntryModal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        entry={editEntry}
        onSave={handleSaveEntry}
        existingSections={[]} // optional: pass actual list
      />
    </>
  );
}
