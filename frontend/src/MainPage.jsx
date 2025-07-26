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

export default function MainPage() {
  const { token, logout } = useContext(AuthContext);
  const [entries, setEntries] = useState([]);
  const [selectedSection, setSelectedSection] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  // Modal state for adding/editing entries
  const [showModal, setShowModal] = useState(false);
  const [editEntry, setEditEntry] = useState(null);

  // Fetch all entries on mount or when token changes
  useEffect(() => {
    if (!token) return;
    axios
      .get('/api/entries', {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => setEntries(res.data))
      .catch((err) => console.error('Error fetching entries:', err));
  }, [token]);

  // Open modal for new entry
  const openNewEntry = () => {
    setEditEntry(null);
    setShowModal(true);
  };

  // Open modal for editing an existing entry
  const openEditEntry = (entry) => {
    setEditEntry(entry);
    setShowModal(true);
  };

  // Handle saving an entry (create or update)
  const handleSaveEntry = async (entryData) => {
    const config = { headers: { Authorization: `Bearer ${token}` } };
    // If an ID exists, update the entry
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
        .then(() => {
          setEntries((prev) =>
            prev.map((e) => (e._id === entryData._id ? { ...e, ...entryData } : e))
          );
        })
        .catch(() => {});
    } else {
      // Otherwise create a new entry, defaulting to today’s date
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
          setEntries((prev) => [res.data, ...prev]);
        })
        .catch(() => {});
    }
    setShowModal(false);
  };

  // Delete an entry with confirmation and toast feedback
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

  // Collect all unique tags from entries for footer
  const allTags = Array.from(
    new Set(
      entries
        .flatMap((e) => (Array.isArray(e.tags) ? e.tags : (e.tags || '').split(',')))
        .map((t) => t.trim())
        .filter((t) => t.length > 0)
    )
  ).sort();

  // Filter entries based on selected section and search query
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

      {/* Modal for adding or editing an entry */}
      <EntryModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        entry={editEntry}
        onSave={handleSaveEntry}
      />

      <div className="main-container">
        <section className="main-feed">
          {filteredEntries.map((entry) => (
            <div className="main-entry" key={entry._id}>
              <h3>{entry.date}</h3>
              <h4>{entry.section}</h4>
              <p>{entry.content}</p>
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
            <div className="sections placeholder-sections">
              <p>Future Place for User Created Sections</p>
            </div>
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
