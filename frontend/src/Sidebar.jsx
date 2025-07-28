import { useEffect, useState, useContext } from 'react';
import { Link, useLocation } from 'react-router-dom';
import './Main.css';
import axios from './api/axiosInstance';
import { AuthContext } from './AuthContext.jsx';

export default function Sidebar() {
  const { token } = useContext(AuthContext);
  const location = useLocation();
  const [sections, setSections] = useState([]);

  useEffect(() => {
    if (!token) return;

    axios
      .get('/api/sections', {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => {
        if (Array.isArray(res.data)) {
          setSections(res.data);
        } else {
          console.warn('⚠️ Sections response not an array:', res.data);
          setSections([]);
        }
      })
      .catch((err) => {
        console.error('⚠️ Error fetching sections:', err);
        setSections([]);
      });
  }, [token]);

  const isActive = (name) =>
    decodeURIComponent(location.pathname).toLowerCase().includes(name.toLowerCase());

  return (
    <aside className="main-sidebar">
      <input type="text" id="search" placeholder="Search..." />

      <div className="sections">
        <h3>Sections</h3>
        <ul>
          {sections.map((name) => (
            <li key={name}>
              <Link
                to={`/section/${encodeURIComponent(name)}`}
                className={`section-link ${isActive(name) ? 'active' : ''}`}
              >
                {name}
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <Link to="/" className="section-link">← Back to the Stream</Link>
    </aside>
  );
}
