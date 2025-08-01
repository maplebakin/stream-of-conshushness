import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useState, useContext } from 'react';
import axios from './api/axiosInstance';
import { AuthContext } from './AuthContext.jsx';
import Header from './Header.jsx';
import EntryModal from './EntryModal.jsx';

export default function SectionPageView() {
  const { sectionName, pageSlug } = useParams();
  const { token } = useContext(AuthContext);
  const navigate = useNavigate();

  const [page, setPage] = useState(null);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pageNotFound, setPageNotFound] = useState(false);

  // For editing entries
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
      setEntries(prev => prev.filter(e => e._id !== entryId));
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
    fetchEntries(); // Refresh entries after save
  };

  if (pageNotFound) return (
    <div className="empty-state" style={{ textAlign: 'center', padding: '2em' }}>
      <div style={{ fontSize: 48, opacity: 0.3 }}>📄</div>
      <p>Page not found.</p>
    </div>
  );

  if (!page) return <p>Loading page…</p>;

  return (
    <>
      <Header />
      <div className="main-container">
        <div className="main-feed">
          <button
            style={{
              marginBottom: 18,
              background: 'var(--color-background, #f0f2f4)',
              border: 'none',
              padding: '0.5em 1em',
              borderRadius: 8,
              cursor: 'pointer',
              color: 'var(--color-accent, #3aa)',
              fontWeight: 'bold'
            }}
            onClick={() => navigate(`/section/${sectionName}`)}
          >
            ← Back to {sectionName}
          </button>
          <h2>{page.title}</h2>
          <div dangerouslySetInnerHTML={{ __html: page.content }} style={{ marginBottom: 24 }} />

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
              <div className="entry-card" key={entry._id} style={{ position: 'relative' }}>
                <h4>{entry.date}</h4>
                <div dangerouslySetInnerHTML={{ __html: entry.content }} />
                {entry.tags && (
                  <div className="tags">
                    {(Array.isArray(entry.tags) ? entry.tags : (entry.tags || '').split(','))
                      .map((tag) => tag.trim())
                      .filter(Boolean)
                      .map((tag) => (
                        <span className="tag" key={tag}>{tag}</span>
                      ))}
                  </div>
                )}
                <div className="main-entry-controls" style={{ marginTop: 10 }}>
                  <button
                    onClick={() => handleEditEntry(entry)}
                    aria-label="Edit Entry"
                    style={{
                      marginRight: 8,
                      background: '#ececec',
                      border: 'none',
                      borderRadius: 5,
                      padding: '0.2em 0.9em',
                      cursor: 'pointer'
                    }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(entry._id)}
                    aria-label="Delete Entry"
                    style={{
                      background: '#ffefef',
                      color: '#c00',
                      border: 'none',
                      borderRadius: 5,
                      padding: '0.2em 0.9em',
                      cursor: 'pointer'
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
      {/* Edit Entry Modal */}
      <EntryModal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        entry={editEntry}
        onSave={handleSaveEntry}
        existingSections={[]} // pass your actual section list if you want!
      />
    </>
  );
}
