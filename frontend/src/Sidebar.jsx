// src/Sidebar.jsx
import { useEffect, useMemo, useState, useContext } from 'react';
import { Link, useLocation } from 'react-router-dom';
import './Sidebar.css';
import axios from './api/axiosInstance';
import { AuthContext } from './AuthContext.jsx';
import { useSearch } from './SearchContext.jsx';

function normalizeSections(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((s) => {
      // Back-compat: server returned just strings
      if (typeof s === 'string') {
        return { key: s, label: s, emoji: '', pinned: false, order: 0 };
      }
      // New API (routes/sections.js) returns { key,label,icon,pinned,order }
      const key =
        s.key ||
        s.slug ||
        (s.name ? String(s.name).toLowerCase().replace(/\s+/g, '-') : '');
      const label = s.label || s.name || s.key || s.slug || 'Untitled';
      const emoji = s.icon || s.emoji || '';
      const pinned = !!s.pinned;
      const order = Number.isFinite(s.order) ? s.order : 0;
      return { key, label, emoji, pinned, order };
    })
    .filter((s) => s.key) // drop invalid
    // Sort: pinned first, then by order, then A→Z
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      if (a.order !== b.order) return a.order - b.order;
      return a.label.localeCompare(b.label);
    });
}

export default function Sidebar() {
  const { token } = useContext(AuthContext);
  const location = useLocation();
  const { search, setSearch } = useSearch();

  const [sections, setSections] = useState([]);
  const [sectionSearchTerm, setSectionSearchTerm] = useState('');
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!token) return;
    axios
      .get('/api/sections') // Authorization header comes from the interceptor
      .then((res) => {
        const list = normalizeSections(res.data);
        setSections(list);
        setError(false);
      })
      .catch((err) => {
        console.error('⚠️ Error fetching sections:', err);
        setSections([]);
        setError(true);
      });
  }, [token]);

  const term = sectionSearchTerm.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!term) return sections;
    return sections.filter(
      (s) =>
        s.label.toLowerCase().includes(term) ||
        s.key.toLowerCase().includes(term)
    );
  }, [sections, term]);

  const isActive = (path) =>
    decodeURIComponent(location.pathname).toLowerCase() ===
    path.toLowerCase();

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
          placeholder="Search sections…"
          value={sectionSearchTerm}
          onChange={(e) => setSectionSearchTerm(e.target.value)}
          className="section-search"
          aria-label="Search sections"
        />
        <input
          type="text"
          placeholder="Search everywhere…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
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
            {filtered.map((s) => {
              const path = `/sections/${encodeURIComponent(s.key)}`;
              const active = isActive(path);
              return (
                <li key={s.key}>
                  <Link
                    to={path}
                    className={active ? 'nav-link active' : 'nav-link'}
                    aria-current={active ? 'page' : undefined}
                    title={s.label}
                  >
                    <span style={{ marginRight: 6 }}>
                      {s.emoji || '📚'}
                    </span>
                    <span>{s.label}</span>
                  </Link>
                </li>
              );
            })}
            {filtered.length === 0 && !error && (
              <li className="sidebar-empty">No sections found.</li>
            )}
          </ul>
        )}
      </div>
    </aside>
  );
}
