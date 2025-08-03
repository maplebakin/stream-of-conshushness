import { Link, useLocation } from 'react-router-dom';
import { useContext } from 'react';
import { AuthContext } from './AuthContext.jsx';
import './Main.css';

export default function Header() {
  const location = useLocation();
  const { isAuthenticated, logout } = useContext(AuthContext);

  const navLink = (to, label) => (
    <Link
      to={to}
      className={`nav-link ${location.pathname === to ? 'active' : ''}`}
      aria-current={location.pathname === to ? 'page' : undefined}
    >
      {label}
    </Link>
  );

  return (
    <header className="centered-header">
      <h1 className="site-title">Stream of Conshushness</h1>
      <nav className="site-nav">
        {navLink("/", "🌊 Stream")}
        {navLink("/today", "📍 Today")}
        {navLink("/calendar", "📆 Calendar")}
        {navLink("/sections", "🎛️ Manage Sections")}
        {isAuthenticated && (
          <button className="logout-button" onClick={logout}>
            Log Out
          </button>
        )}
      </nav>
    </header>
  );
}
