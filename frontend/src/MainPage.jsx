// MainPage.jsx  ─────────────────────────────────────────────
import { useEffect, useState, useContext } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';

import EntryModal            from './EntryModal.jsx';
import axios                 from './api/axiosInstance';
import { AuthContext }       from './AuthContext.jsx';
import { useSearch }         from './SearchContext.jsx';

import './Main.css';

/* ---------- helpers ---------- */

const todayIso = () =>
  new Date().toISOString().slice(0, 10);               // “2025-08-03”

/** Sort list so the newest thing (by date → createdAt → _id) is first */
const sortEntries = (list) =>
  [...list].sort((a, b) => {
    // primary: entry.date
    const dA = new Date(a.date);
    const dB = new Date(b.date);
    if (dA > dB) return -1;
    if (dA < dB) return 1;

    // secondary: createdAt (more precise than date alone)
    const cA = new Date(a.createdAt);
    const cB = new Date(b.createdAt);
    if (cA > cB) return -1;
    if (cA < cB) return 1;

    // fallback: ObjectId timestamp
    return b._id.localeCompare(a._id);
  });

/* ---------- component ---------- */

export default function MainPage() {
  const { token, logout } = useContext(AuthContext);
  const { search }        = useSearch();

  const [entries,         setEntries]         = useState([]);
  const [selectedSection, setSelectedSection] = useState('');
  const [showModal,       setShowModal]       = useState(false);
  const [editEntry,       setEditEntry]       = useState(null);

  /* fetch once we have a token */
  useEffect(() => {
    if (!token) return;
    axios
      .get('/api/entries', { headers: { Authorization: `Bearer ${token}` } })
      .then(res => setEntries(sortEntries(res.data)))
      .catch(err => console.error('Error fetching entries:', err));
  }, [token]);

  /* ---------- modal helpers ---------- */
  const openNewEntry  = ()      => { setEditEntry(null);  setShowModal(true); };
  const openEditEntry = (e)     => { setEditEntry(e);     setShowModal(true); };
  const closeModal    = ()      => setShowModal(false);

  /* ---------- create | update ---------- */
  const handleSaveEntry = async (entryData) => {
    const cfg = { headers: { Authorization: `Bearer ${token}` } };

    if (entryData._id) {
      /* update */
      const { _id, date, ...rest } = entryData;          // don’t clobber date
      await toast.promise(
        axios.put(`/api/entries/${_id}`, rest, cfg),
        { loading:'Updating…', success:'Updated!', error:'Error updating' }
      )
      .then(res =>
        setEntries(prev => sortEntries(
          prev.map(e => (e._id === _id ? res.data : e))
        ))
      )
      .catch(() => {/* toast already handled */});
    } else {
      /* create */
      const payload = { ...entryData, date: todayIso() };
      await toast.promise(
        axios.post('/api/entries', payload, cfg),
        { loading:'Saving…', success:'Added!',  error:'Error adding' }
      )
      .then(res => setEntries(prev => sortEntries([res.data, ...prev])))
      .catch(() => {});
    }

    closeModal();
  };

  /* ---------- delete ---------- */
  const handleDelete = (id) => {
    if (!window.confirm('Delete this entry?')) return;
    toast.promise(
      axios.delete(`/api/entries/${id}`, { headers: { Authorization: `Bearer ${token}` } }),
      { loading:'Deleting…', success:'Deleted!', error:'Error deleting' }
    )
    .then(() => setEntries(prev => prev.filter(e => e._id !== id)))
    .catch(() => {});
  };

  /* ---------- derived data ---------- */
  const allSections = Array.from(new Set(entries.map(e => e.section).filter(Boolean))).sort();

  const query = (search || '').replace(/^#/, '').toLowerCase();
  const filtered = entries.filter(e => {
    const inSection = !selectedSection || e.section === selectedSection;
    if (!query) return inSection;
    const tagString = Array.isArray(e.tags) ? e.tags.join(', ') : (e.tags || '');
    return inSection && (
      e.content?.toLowerCase().includes(query)   ||
      e.date?.toLowerCase().includes(query)      ||
      e.section?.toLowerCase().includes(query)   ||
      tagString.toLowerCase().includes(query)
    );
  });

  /* ---------- render ---------- */
  return (
    <>
      {/* ——— Site nav ---------------------------------------------------- */}
      <header>
        <h1>Stream&nbsp;of&nbsp;Conshushness</h1>
        <nav>
          <Link to="/">The Stream</Link>
          <Link to="/calendar">📅 Calendar</Link>
          <button onClick={logout}>Log&nbsp;Out</button>
        </nav>
      </header>

      {/* ——— New-entry button ------------------------------------------- */}
      <button className="toggle-entry-btn" onClick={openNewEntry}>
        New Entry
      </button>

      {/* ——— Entry modal ------------------------------------------------- */}
      <EntryModal
        isOpen={showModal}
        onClose={closeModal}
        entry={editEntry}
        onSave={handleSaveEntry}
        existingSections={allSections}
      />

      {/* ——— Feed -------------------------------------------------------- */}
      <div className="main-feed">
        {/* section pills */}
        <div className="entry-filters">
          <div className="section-pills">
            <button
              className={!selectedSection ? 'pill active' : 'pill'}
              onClick={() => setSelectedSection('')}
            >
              All
            </button>
            {allSections.map(sec => (
              <button
                key={sec}
                className={selectedSection === sec ? 'pill active' : 'pill'}
                onClick={() => setSelectedSection(sec)}
              >
                {sec}
              </button>
            ))}
          </div>
        </div>

        {/* entries */}
        {filtered.length === 0 ? (
          <div className="empty-state">No entries found.</div>
        ) : (
          filtered.map(e => (
            <div key={e._id} className="main-entry">
              <h3>{e.date}</h3>
              <h4>{e.section}</h4>

              <div
                className="entry-content"
                dangerouslySetInnerHTML={{ __html: e.content }}
              />

              {e.tags?.length > 0 && (
                <div className="tags">
                  {[...new Set(
                    (Array.isArray(e.tags) ? e.tags : e.tags.split(','))
                      .map(t => t.trim())
                      .filter(Boolean)
                  )].map((tag,i) => (
                    <span key={`${e._id}-tag-${i}`} className="tag-pill">#{tag}</span>
                  ))}
                </div>
              )}

              <div className="main-entry-controls">
                <button onClick={() => openEditEntry(e)}>Edit</button>
                <button onClick={() => handleDelete(e._id)}>Delete</button>
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}
