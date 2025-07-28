import { useState, useEffect, useContext } from 'react';
import axios from './api/axiosInstance';
import { AuthContext } from './AuthContext.jsx';
import Header from './Header.jsx';
import Sidebar from './Sidebar.jsx';
import './Main.css';

export default function ManageSections() {
  const { token } = useContext(AuthContext);
  const [sections, setSections] = useState([]);
  const [editingSection, setEditingSection] = useState(null);
  const [newName, setNewName] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchSections = () => {
    if (!token) return;
    axios
      .get('/api/sections', {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => {
        setSections(Array.isArray(res.data) ? res.data : []);
      })
      .catch((err) => {
        console.error('⚠️ Failed to load sections:', err);
        setSections([]);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchSections();
  }, [token]);

  const handleRename = (oldName) => {
    if (!newName.trim()) return;
    axios
      .put(
        '/api/sections/rename',
        { oldName, newName },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      .then(() => {
        fetchSections();
        setEditingSection(null);
        setNewName('');
        window.location.reload();
      })
      .catch((err) => {
        console.error('⚠️ Failed to rename section:', err);
      });
  };

  const handleDelete = (name) => {
    if (!confirm(`Are you sure you want to delete all entries in "${name}"?`))
      return;

    axios
      .delete(`/api/sections/${encodeURIComponent(name)}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then(() => {
        fetchSections();
        window.location.reload();
      })
      .catch((err) => {
        console.error('⚠️ Failed to delete section:', err);
      });
  };

  if (loading) return <p className="section-page">Loading...</p>;

  return (
    <>
      <Header />
      <div className="main-container">
        <div className="main-feed">
          <h2>Manage Sections</h2>
          {sections.length === 0 ? (
            <p>No sections found.</p>
          ) : (
            <ul className="section-list">
              {sections.map((section) => (
                <li key={section} className="section-item">
                  {editingSection === section ? (
                    <>
                      <input
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder="New name"
                        className="section-input"
                      />
                      <button
                        className="small-button"
                        onClick={() => handleRename(section)}
                      >
                        Save
                      </button>
                      <button
                        className="small-button cancel"
                        onClick={() => {
                          setEditingSection(null);
                          setNewName('');
                        }}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="section-name">{section}</span>
                      <button
                        className="small-button"
                        onClick={() => {
                          setEditingSection(section);
                          setNewName(section);
                        }}
                      >
                        Rename
                      </button>
                      <button
                        className="small-button danger"
                        onClick={() => handleDelete(section)}
                      >
                        Delete
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <Sidebar />
      </div>
    </>
  );
}
