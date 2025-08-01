import { useEffect, useState, useContext } from 'react';
import { Link } from 'react-router-dom';
import axios from './api/axiosInstance';
import { AuthContext } from './AuthContext.jsx';
import Header from './Header.jsx';
import './Main.css';

export default function SectionsPage() {
  const { token } = useContext(AuthContext);
  const [sections, setSections] = useState([]);
  const [reassignFrom, setReassignFrom] = useState('');
  const [reassignTo, setReassignTo] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [newSection, setNewSection] = useState('');
  const [adding, setAdding] = useState(false);
  const [reassigning, setReassigning] = useState(false);

  const fetchSections = () => {
    if (!token) return;
    setLoading(true);
    axios
      .get('/api/sections', {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => {
        setSections(Array.isArray(res.data) ? res.data.sort() : []);
      })
      .catch((err) => {
        console.error('⚠️ Failed to fetch sections:', err);
        setSections([]);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchSections();
    // eslint-disable-next-line
  }, [token]);

  const handleCreateSection = async () => {
    if (!newSection.trim()) return;
    setAdding(true);
    try {
      await axios.post(
        '/api/sections',
        { name: newSection.trim() },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      setStatus(`✅ Added "${newSection.trim()}"`);
      setNewSection('');
      fetchSections();
    } catch (err) {
      console.error('⚠️ Create error:', err);
      setStatus('⚠️ Failed to create section');
    } finally {
      setAdding(false);
    }
  };

  const handleReassign = async () => {
    if (!reassignFrom.trim() || !reassignTo.trim()) return;
    setReassigning(true);
    try {
      await axios.put(
        '/api/sections/rename',
        {
          oldName: reassignFrom.trim(),
          newName: reassignTo.trim(),
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      setStatus(`✅ Moved "${reassignFrom}" → "${reassignTo}"`);
      setReassignFrom('');
      setReassignTo('');
      fetchSections();
    } catch (err) {
      console.error('⚠️ Reassign error:', err);
      setStatus('⚠️ Failed to reassign section');
    } finally {
      setReassigning(false);
    }
  };

  const handleDelete = async (sectionName) => {
    if (!window.confirm(`Delete all entries in "${sectionName}"?`)) return;
    try {
      await axios.delete(`/api/sections/${encodeURIComponent(sectionName)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setStatus(`🗑️ Deleted section "${sectionName}"`);
      fetchSections();
    } catch (err) {
      console.error('⚠️ Delete error:', err);
      setStatus('⚠️ Failed to delete section');
    }
  };

  return (
    <>
      <Header />
      <div className="main-container">
        <div className="main-feed">
          <h2>Manage Sections</h2>

          <div className="add-section-form" style={{ marginBottom: '1em' }}>
            <input
              placeholder="New section name…"
              value={newSection}
              onChange={(e) => setNewSection(e.target.value)}
              style={{ marginRight: 8 }}
              disabled={adding}
            />
            <button
              className="small-button"
              onClick={handleCreateSection}
              disabled={!newSection.trim() || adding}
            >
              {adding ? 'Adding…' : '+ Add Section'}
            </button>
          </div>

          {loading ? (
            <p>Loading sections...</p>
          ) : sections.length === 0 ? (
            <p>No sections found.</p>
          ) : (
            <ul className="section-list">
              {sections.map((s) => (
                <li key={s} className="section-item">
                  <strong>{s}</strong>{' '}
                  <Link to={`/section/${encodeURIComponent(s)}`}>🔗 View</Link>{' '}
                  <button
                    className="small-button danger"
                    aria-label={`Delete section ${s}`}
                    onClick={() => handleDelete(s)}
                    disabled={adding || reassigning}
                  >
                    🗑️ Delete
                  </button>
                </li>
              ))}
            </ul>
          )}

          <hr />

          <h3>Reassign Entries to New Section</h3>
          <div className="section-reassign" style={{ display: 'flex', gap: '8px', marginTop: '0.5em' }}>
            <input
              placeholder="From section..."
              value={reassignFrom}
              onChange={(e) => setReassignFrom(e.target.value)}
              disabled={reassigning}
            />
            <input
              placeholder="To section..."
              value={reassignTo}
              onChange={(e) => setReassignTo(e.target.value)}
              disabled={reassigning}
            />
            <button
              className="small-button"
              onClick={handleReassign}
              disabled={!reassignFrom.trim() || !reassignTo.trim() || reassigning}
            >
              {reassigning ? 'Reassigning…' : 'Reassign'}
            </button>
          </div>

          {status && <p className="status-text">{status}</p>}
        </div>
      </div>
    </>
  );
}
