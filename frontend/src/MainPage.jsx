import axios from 'axios';
import { useEffect, useState } from 'react';
import './Main.css';
import { Link } from 'react-router-dom';

function getTodayISO() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}

export default function MainPage() {
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
    axios.get('/api/entries')
      .then(res => setEntries(res.data))
      .catch(err => console.error('Error fetching entries:', err));
  }, []);

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
        ? newEntry.tags.split(',').map(t => t.trim()).filter(Boolean)
        : [],
    };

    if (editingId) {
      axios.put(`/api/edit-entry/${editingId}`, entryToSave)
        .then(() => {
          setEntries(entries.map(e => e.id === editingId ? { ...e, ...entryToSave } : e));
          resetForm();
        })
        .catch(err => console.error('Error updating entry:', err));
    } else {
      axios.post('/api/add-entry', entryToSave)
        .then(res => {
          setEntries([res.data, ...entries]);
          resetForm();
        })
        .catch(err => console.error('Error adding entry:', err));
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
    setEditingId(entry.id);
    setNewEntry({
      section: entry.section,
      tags: Array.isArray(entry.tags) ? entry.tags.join(', ') : (entry.tags || ''),
      content: entry.content,
      date: entry.date,
    });
    setShowForm(true);
  };

  const handleDelete = (id) => {
    if (!window.confirm('Delete this entry?')) return;
    axios.delete(`/api/delete-entry/${id}`)
      .then(() => setEntries(entries.filter(e => e.id !== id)))
      .catch(err => console.error('Error deleting entry:', err));
  };
const allTags = Array.from(new Set(
  entries.flatMap(e =>
    Array.isArray(e.tags)
      ? e.tags
      : (e.tags ? e.tags.split(',').map(t => t.trim()) : [])
  ).filter(Boolean)
));

  const filteredEntries = entries.filter((entry) => {
    const matchesSection = !selectedSection || entry.section === selectedSection;
    const searchLower = searchQuery.toLowerCase();

    const matchesSearch = !searchQuery || (
      (entry.content && entry.content.toLowerCase().includes(searchLower)) ||
      (entry.date && entry.date.toLowerCase().includes(searchLower)) ||
      (entry.section && entry.section.toLowerCase().includes(searchLower)) ||
      (Array.isArray(entry.tags) && entry.tags.join(', ').toLowerCase().includes(searchLower))
    );

    return matchesSection && matchesSearch;
  });

  return (
    
    <>
      <header>
        <h1>Stream of Conshushness</h1>
        <nav>
          <Link to="/">The Stream</Link>
          <Link to="/calendar">📅 Calendar</Link>
        </nav>
      </header>

      <button
        id="toggle-entry-form"
        className="toggle-entry-btn"
        onClick={toggleForm}
      >
        {showForm ? 'Close Entry' : (editingId ? 'Edit Entry' : 'New Entry')}
      </button>

      <div className={`main-add-entry ${showForm ? 'active' : ''}`}>
        {showForm && (
          <form onSubmit={handleSubmit}>
            <h2>{editingId ? 'Edit Entry' : 'Add New Entry'}</h2>

            <label>
              Section
              <select
                id="section"
                value={newEntry.section}
                onChange={handleChange}
              >
                <option value="Floating in the Stream">Floating in the Stream</option>
                <option value="General">General</option>
                <option value="Gaming">Gaming</option>
                <option value="Magnetic Energy Stream Theory">Magnetic Energy Stream Theory</option>
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
            <div className="main-entry" key={entry.id}>
              <h3>{entry.date}</h3>
              <h4>{entry.section}</h4>
              <p>{entry.content}</p>
              {entry.tags && entry.tags.toString().trim().length > 0 && (
                <div className="tags">
                  {(Array.isArray(entry.tags) ? entry.tags : entry.tags.split(',')).map((tag, i) => (
                    <span key={i} className="tag-pill">#{tag.trim()}</span>
                  ))}
                </div>
              )}
              <div className="main-entry-controls">
                <button onClick={() => startEdit(entry)}>Edit</button>
                <button onClick={() => handleDelete(entry.id)}>Delete</button>
              </div>
            </div>
          ))}
        </section>

        <aside className="main-sidebar">
          <input
            type="text"
            id="search"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <div className="calendar">
            <Link to="/calendar">📅 Open Calendar</Link>
          </div>
          <div className="sections">
            <ul>
              <li><button
                className={!selectedSection ? 'active' : ''}
                onClick={() => setSelectedSection('')}
              >All</button></li>
              <li><button
                className={selectedSection === 'Floating in the Stream' ? 'active' : ''}
                onClick={() => setSelectedSection('Floating in the Stream')}
              >Floating in the Stream</button></li>
              <li><button
                className={selectedSection === 'General' ? 'active' : ''}
                onClick={() => setSelectedSection('General')}
              >General</button></li>
              <li><button
                className={selectedSection === 'Gaming' ? 'active' : ''}
                onClick={() => setSelectedSection('Gaming')}
              >Gaming</button></li>
              <li><button
                className={selectedSection === 'Magnetic Energy Stream Theory' ? 'active' : ''}
                onClick={() => setSelectedSection('Magnetic Energy Stream Theory')}
              >Magnetic Energy Stream Theory</button></li>
            </ul>
          </div>
        </aside>
      </div>

      <footer id="tag-footer">
  {allTags.map((tag, i) => (
    <a
      key={i}
      href="#"
      className={searchQuery === `#${tag}` ? 'active' : ''}
      onClick={(e) => {
        e.preventDefault();
        setSearchQuery(`${tag}`);
      }}
    >
      #{tag}
    </a>
  ))}
</footer>

    </>
  );
}
