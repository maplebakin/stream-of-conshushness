import axios from './api/axiosInstance';
import { useEffect, useState, useContext } from 'react';
import './Main.css';
import { Link } from 'react-router-dom';
import { AuthContext } from './AuthContext.jsx';
import toast from 'react-hot-toast';

function getTodayISO() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}

export default function MainPage() {
  const { token, logout } = useContext(AuthContext);

  const [entries, setEntries] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [newEntry, setNewEntry] = useState({
    section: 'Floating in the Stream',
    tags: '',
    content: '',
    date: '',
  });
  const [editingId, setEditingId] = useState(null);
  const [selectedSection, setSelectedSection] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (!token) return;
    axios
      .get('/api/entries', {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => setEntries(res.data))
      .catch((err) => console.error('Error fetching entries:', err));
  }, [token]);

  const toggleForm = () => setShowForm(!showForm);

  const handleChange = (e) => {
    const { id, value } = e.target;
    setNewEntry({ ...newEntry, [id]: value });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!newEntry.content.trim()) return;

    const isoDate = editingId ? newEntry.date : getTodayISO();

    const entryToSave = {
      ...newEntry,
      date: isoDate,
      tags: newEntry.tags
        ? newEntry.tags.split(',').map((t) => t.trim()).filter(Boolean)
        : [],
    };

    const config = {
      headers: { Authorization: `Bearer ${token}` },
    };

    if (editingId) {
      // Update existing entry with toast notifications
      toast
        .promise(
          axios.put(`/api/entries/${editingId}`, entryToSave, config),
          {
            loading: 'Updating entry…',
            success: 'Entry updated!',
            error: 'Error updating entry',
          }
        )
        .then((res) => {
          const updated = res.data || entryToSave;
          setEntries(entries.map((e) => (e._id === editingId ? { ...e, ...updated } : e)));
          resetForm();
        })
        .catch(() => {});
    } else {
      // Create new entry with toast notifications
      toast
        .promise(
          axios.post('/api/entries', entryToSave, config),
          {
            loading: 'Saving entry…',
            success: 'Entry added!',
            error: 'Error adding entry',
          }
        )
        .then((res) => {
          setEntries([res.data, ...entries]);
          resetForm();
        })
        .catch(() => {});
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setNewEntry({
      section: 'Floating in the Stream',
      tags: '',
      content: '',
      date: '',
    });
    setShowForm(false);
  };

  const startEdit = (entry) => {
    setEditingId(entry._id);
    setNewEntry({
      section: entry.section,
      tags: Array.isArray(entry.tags) ? entry.tags.join(', ') : entry.tags || '',
      content: entry.content,
      date: entry.date,
    });
    setShowForm(true);
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
      .then(() => setEntries(entries.filter((e) => e._id !== id)))
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

      <button id="toggle-entry-form" className="toggle-entry-btn" onClick={toggleForm}>
        {showForm ? 'Close Entry' : editingId ? 'Edit Entry' : 'New Entry'}
      </button>

      <div className={`main-add-entry ${showForm ? 'active' : ''}`}>
        {showForm && (
          <form onSubmit={handleSubmit}>
            <h2>{editingId ? 'Edit Entry' : 'Add New Entry'}</h2>

            <label>
              Section
              <select id="section" value={newEntry.section} onChange={handleChange}>
                <option value="Floating in the Stream">Floating in the Stream</option>
                <option value="Reflections">Reflections</option>
                <option value="Ideas & Plans">Ideas & Plans</option>
                <option value="Creative Stream">Creative Stream</option>
                <option value="Notes & Research">Notes & Research</option>
                <option value="Free Writing">Free Writing</option>
                <option value="Personal Log">Personal Log</option>
                <option value="Open Thoughts">Open Thoughts</option>
              </select>
            </label>

            <label>
              Tags (comma-separated)
              <input
                id="tags"
                type="text"
                placeholder="e.g. ideas, daily"
                value={newEntry.tags}
                onChange={handleChange}
              />
            </label>

            <label>
              Content
              <textarea
                id="content"
                placeholder="Write your thoughts here"
                value={newEntry.content}
                onChange={handleChange}
              />
            </label>

            <button type="submit">{editingId ? 'Save Changes' : 'Add Entry'}</button>
          </form>
        )}
      </div>

      <div className="main-container">
        <section className="main-feed">
          {filteredEntries.map((entry) => (
            <div className="main-entry" key={entry._id}>
              <h3>{entry.date}</h3>
              <h4>{entry.section}</h4>
              <p>{entry.content}</p>
              {entry.tags && entry.tags.toString().trim().length > 0 && (
                <div className="tags">
                  {[...new Set((Array.isArray(entry.tags) ? entry.tags : entry.tags.split(',')).map((tag) => tag.trim()).filter(Boolean))].map((tag, i) => (
                    <span key={`${entry._id}-tag-${i}`} className="tag-pill">
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
              <div className="main-entry-controls">
                <button onClick={() => startEdit(entry)}>Edit</button>
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
