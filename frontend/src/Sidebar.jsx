import { useEffect, useState, useContext } from 'react';
import { Link, useLocation } from 'react-router-dom';
import './Main.css';
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
    <aside className="main-sidebar">
      <nav className="main-nav">
        <Link
          to="/"
          className={isActive('/') ? 'section-link active' : 'section-link'}
          aria-current={isActive('/') ? 'page' : undefined}
        >
          🌊 Stream
        </Link>
        <Link
          to="/calendar"
          className={isActive('/calendar') ? 'section-link active' : 'section-link'}
          aria-current={isActive('/calendar') ? 'page' : undefined}
        >
          📆 Calendar
        </Link>
      </nav>

      <input
        type="text"
        id="section-search"
        placeholder="Search sections..."
        value={sectionSearchTerm}
        onChange={e => setSectionSearchTerm(e.target.value)}
        className="section-search"
        aria-label="Search sections"
      />
      <input
        type="text"
        id="global-search"
        placeholder="Search everywhere…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="section-search"
        aria-label="Search everything"
      />

      <div className="sections">
        <h3>Sections</h3>
        {error ? (
          <div className="sidebar-error">Couldn’t load sections.</div>
        ) : (
          <ul>
            {sections
              .filter(name => name.toLowerCase().includes(sectionSearchTerm.toLowerCase()))
              .map(name => {
                const path = `/section/${encodeURIComponent(name)}`;
                return (
                  <li key={name}>
                    <Link
                      to={path}
                      className={isActive(path) ? 'section-link active' : 'section-link'}
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
