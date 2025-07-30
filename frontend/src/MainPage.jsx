import EntryModal from './EntryModal.jsx';
import axios from './api/axiosInstance';
import { useEffect, useState, useContext } from 'react';
import './Main.css';
import { Link } from 'react-router-dom';
import { AuthContext } from './AuthContext.jsx';
import toast from 'react-hot-toast';

function getTodayISO() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
    today.getDate()
  ).padStart(2, '0')}`;
}

function sortEntriesByDateDesc(list) {
  return [...list].sort((a, b) => new Date(b.date) - new Date(a.date));
}

export default function MainPage() {
  const { token, logout } = useContext(AuthContext);
  const [entries, setEntries] = useState([]);
  const [selectedSection, setSelectedSection] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editEntry, setEditEntry] = useState(null);

  useEffect(() => {
    if (!token) return;
    axios
      .get('/api/entries', {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => {
  const sorted = res.data.sort((a, b) => {
    const dateA = new Date(a.date);
    const dateB = new Date(b.date);
    if (dateA > dateB) return -1;
    if (dateA < dateB) return 1;
    // If same day, use MongoDB _id timestamp
    return b._id.localeCompare(a._id); // Newest entry first
  });
  setEntries(sorted);
})

      .catch((err) => console.error('Error fetching entries:', err));
  }, [token]);

  const openNewEntry = () => {
    setEditEntry(null);
    setShowModal(true);
  };

  const openEditEntry = (entry) => {
    setEditEntry(entry);
    setShowModal(true);
  };

const handleSaveEntry = async (entryData) => {
  const config = { headers: { Authorization: `Bearer ${token}` } };

  if (entryData._id) {
    await toast
      .promise(
        axios.put(`/api/entries/${entryData._id}`, entryData, config),
        {
          loading: 'Updating entry…',
          success: 'Entry updated!',
          error: 'Error updating entry',
        }
      )
      .then((res) => {
        setEntries((prev) =>
          sortEntriesByDateDesc(
            prev.map((e) => (e._id === entryData._id ? res.data : e))
          )
        );
      })
      .catch(() => {});
  } else {
    const payload = { ...entryData, date: getTodayISO() };
    await toast
      .promise(
        axios.post('/api/entries', payload, config),
        {
          loading: 'Saving entry…',
          success: 'Entry added!',
          error: 'Error adding entry',
        }
      )
      .then((res) => {
        setEntries((prev) => sortEntriesByDateDesc([res.data, ...prev]));
      })
      .catch(() => {});
  }

  setShowModal(false);
};


  const handleDelete = (id) => {
    if (!window.confirm('Delete this entry?')) return;
    toast
      .promise(
        axios.delete(`/api/entries/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        {
          loading: 'Deleting entry…',
          success: 'Entry deleted!',
          error: 'Error deleting entry',
        }
      )
      .then(() => setEntries((prev) => prev.filter((e) => e._id !== id)))
      .catch(() => {});
  };

  const allTags = Array.from(
    new Set(
      entries
        .flatMap((e) => (Array.isArray(e.tags) ? e.tags : (e.tags || '').split(',')))
        .map((t) => t.trim())
        .filter((t) => t.length > 0)
    )
  ).sort();

  const allSections = Array.from(
    new Set(entries.map((entry) => entry.section).filter(Boolean))
  ).sort();

  const filteredEntries = entries.filter((entry) => {
    const matchesSection = !selectedSection || entry.section === selectedSection;
    const normalizedSearch = searchQuery.replace(/^#/, '').toLowerCase();
    const matchesSearch =
      !normalizedSearch ||
      (entry.content && entry.content.toLowerCase().includes(normalizedSearch)) ||
      (entry.date && entry.date.toLowerCase().includes(normalizedSearch)) ||
      (entry.section && entry.section.toLowerCase().includes(normalizedSearch)) ||
      (Array.isArray(entry.tags) && entry.tags.join(', ').toLowerCase().includes(normalizedSearch));
    return matchesSection && matchesSearch;
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

      <button id="toggle-entry-form" className="toggle-entry-btn" onClick={openNewEntry}>
        New Entry
      </button>

      <EntryModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        entry={editEntry}
        onSave={handleSaveEntry}
        existingSections={allSections}
      />

      <div className="main-container">
        <section className="main-feed">
          {filteredEntries.map((entry) => (
            <div className="main-entry" key={entry._id}>
              <h3>{entry.date}</h3>
              <h4>{entry.section}</h4>
              <div
             className="entry-content"
                dangerouslySetInnerHTML={{ __html: entry.content }}
              />

              {entry.image && (
                <div className="entry-image">
                  <img
                    src={entry.image}
                    alt="Attached"
                    style={{
                      maxWidth: '100%',
                      borderRadius: '12px',
                      marginTop: '0.5rem',
                      boxShadow: '0 2px 6px rgba(0, 0, 0, 0.15)',
                    }}
                  />
                </div>
              )}

              {entry.tags && entry.tags.toString().trim().length > 0 && (
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
              <div className="main-entry-controls">
                <button onClick={() => openEditEntry(entry)}>Edit</button>
                <button onClick={() => handleDelete(entry._id)}>Delete</button>
              </div>
            </div>
          ))}
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
          </div>
 <div className="sections">
  {allSections.map((section) => (
    <Link
      key={section}
      to={`/section/${encodeURIComponent(section)}`}
      className="section-link"
    >
      {section}
    </Link>
  ))}
</div>

        </aside>
      </div>

     
    </>
  );
}
