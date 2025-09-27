// src/Header.jsx
import { Link, useLocation } from 'react-router-dom';
import { useContext } from 'react';
import { AuthContext } from './AuthContext.jsx';
import './Main.css';
import './Header.css';

function isActivePath(pathname, to) {
  if (to === '/today') {
    // treat /today and any /day/:date as "Today"
    return pathname === '/today' || pathname.startsWith('/day/');
  }
  if (to === '/sections') {
    // /sections and any child
    return pathname === '/sections' || pathname.startsWith('/sections/');
  }
  if (to === '/settings') {
    // user/account settings variants
    return pathname === '/settings' || pathname.startsWith('/account');
  }
  // exact match for everything else
  return pathname === to;
}

export default function Header() {
  const location = useLocation();
  const { isAuthenticated, logout } = useContext(AuthContext);

  const NavItem = ({ to, label }) => {
    const active = isActivePath(location.pathname, to);
    return (
      <Link
        to={to}
        className={`nav-pill${active ? ' nav-pill--active' : ''}`}
        aria-current={active ? 'page' : undefined}
      >
        {label}
      </Link>
    );
  };

  return (
    <header className="app-header" role="banner">
      {/* Title */}
      <h1 className="app-header__title">
        Stream of Conshushness
      </h1>

      {/* Main Nav */}
      <nav className="primary-nav" aria-label="Primary navigation">
        <NavItem to="/" label="🌊 Stream" />
        <NavItem to="/today" label="📍 Today" />
        <NavItem to="/calendar" label="📆 Calendar" />
        <NavItem to="/sections" label="🎛️ Sections" />
        {isAuthenticated && <NavItem to="/settings" label="⚙️ User Settings" />}

        {isAuthenticated && (
          <button
            type="button"
            onClick={logout}
            className="logout-button"
          >
            Log Out
          </button>
        )}
      </nav>
    </header>
  );
}
