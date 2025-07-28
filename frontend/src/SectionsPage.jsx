import { useEffect, useState, useContext } from 'react';
import { Link } from 'react-router-dom';
import axios from './api/axiosInstance';
import { AuthContext } from './AuthContext.jsx';
import Header from './Header.jsx';
import Sidebar from './Sidebar.jsx';
import './Main.css';

export default function SectionsPage() {
  const { token } = useContext(AuthContext);
  const [sections, setSections] = useState([]);
  const [reassignFrom, setReassignFrom] = useState('');
  const [reassignTo, setReassignTo] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchSections = () => {
    if (!token) return;
    setLoading(true);
    axios
      .get('/api/sections', {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => {
        setSections(Array.isArray(res.data) ? res.data : []);
      })
      .catch((err) => {
        console.error('⚠️ Failed to fetch sections:', err);
        setSections([]);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchSections();
  }, [token]);

  const handleReassign = async () => {
    if (!reassignFrom.trim() || !reassignTo.trim()) return;

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
      fetchSections(); // refresh sidebar + local view
    } catch (err) {
      console.error('⚠️ Reassign error:', err);
      setStatus('⚠️ Failed to reassign section');
    }
  };

  const handleDelete = async (sectionName) => {
    if (!window.confirm(`Delete all entries in "${sectionName}"?`)) return;
    try {
      await axios.delete(`/api/sections/${encodeURIComponent(sectionName)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setStatus(`🗑️ Deleted section "${sectionName}"`);
      fetchSections(); // keep sidebar in sync
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
                  <button className="small-button danger" onClick={() => handleDelete(s)}>
                    🗑️ Delete
                  </button>
                </li>
              ))}
            </ul>
          )}

          <hr />

          <h3>Reassign Entries to New Section</h3>
          <div className="section-reassign">
            <input
              placeholder="From section..."
              value={reassignFrom}
              onChange={(e) => setReassignFrom(e.target.value)}
            />
            <input
              placeholder="To section..."
              value={reassignTo}
              onChange={(e) => setReassignTo(e.target.value)}
            />
            <button className="small-button" onClick={handleReassign}>
              Reassign
            </button>
            {status && <p className="status-text">{status}</p>}
          </div>
        </div>

        <Sidebar />
      </div>
    </>
  );
}
