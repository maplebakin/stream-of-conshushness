// src/Sidebar.jsx
import { useEffect, useState, useContext } from 'react';
import { Link, useLocation } from 'react-router-dom';
import './Sidebar.css';
import axios from './api/axiosInstance';
import { AuthContext } from './AuthContext.jsx';
import { useSearch } from "./SearchContext.jsx";

export default function Sidebar() {
  const { token } = useContext(AuthContext);
  const location = useLocation();
  const [sections, setSections] = useState([]);
  const [sectionSearchTerm, setSectionSearchTerm] = useState('');
  const [error, setError] = useState(false);
  const { search, setSearch } = useSearch();

  useEffect(() => {
    if (!token) return;

    axios
      .get('/api/sections', {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => {
        if (Array.isArray(res.data)) {
          setSections(res.data);
          setError(false);
        } else {
          setError(true);
          setSections([]);
        }
      })
      .catch((err) => {
        console.error('⚠️ Error fetching sections:', err);
        setError(true);
        setSections([]);
      });
  }, [token]);

  const isActive = (path) =>
    decodeURIComponent(location.pathname).toLowerCase() === path.toLowerCase();

  return (
    <aside className="sidebar">
      <nav className="sidebar-nav">
        <Link
          to="/"
          className={isActive('/') ? 'nav-link active' : 'nav-link'}
          aria-current={isActive('/') ? 'page' : undefined}
        >
          🌊 Stream
        </Link>
        <Link
          to="/calendar"
          className={isActive('/calendar') ? 'nav-link active' : 'nav-link'}
          aria-current={isActive('/calendar') ? 'page' : undefined}
        >
          📆 Calendar
        </Link>
      </nav>

      <div className="search-block">
        <input
          type="text"
          placeholder="Search sections..."
          value={sectionSearchTerm}
          onChange={e => setSectionSearchTerm(e.target.value)}
          className="section-search"
          aria-label="Search sections"
        />
        <input
          type="text"
          placeholder="Search everywhere…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="section-search"
          aria-label="Search everything"
        />
      </div>

      <div className="sections">
        <h3 className="sections-header">Sections</h3>
        {error ? (
          <div className="sidebar-error">Couldn’t load sections.</div>
        ) : (
          <ul className="section-list">
            {sections
              .filter(name => name.toLowerCase().includes(sectionSearchTerm.toLowerCase()))
              .map(name => {
                const path = `/section/${encodeURIComponent(name)}`;
                return (
                  <li key={name}>
                    <Link
                      to={path}
                      className={isActive(path) ? 'nav-link active' : 'nav-link'}
                      aria-current={isActive(path) ? 'page' : undefined}
                    >
                      {name}
                    </Link>
                  </li>
                );
              })}
            {sections.length === 0 && !error && (
              <li className="sidebar-empty">No sections found.</li>
            )}
          </ul>
        )}
      </div>
    </aside>
  );
}
