import { Link, useLocation } from 'react-router-dom';
import './Main.css';

export default function Sidebar({ sectionName }) {
  const location = useLocation();

  const sections = [
    'Floating in the Stream',
    'Gaming',
    'Unnecessary Questions',
  ];

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
