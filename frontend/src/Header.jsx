// src/Header.jsx
import { Link, useLocation } from 'react-router-dom';
import { useContext } from 'react';
import { AuthContext } from './AuthContext.jsx';
import './Main.css';

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
        className={`px-4 py-2 rounded-button font-thread transition-all ${
          active ? 'bg-plum text-mist shadow-soft' : 'text-ink hover:bg-thread hover:text-mist'
        }`}
        aria-current={active ? 'page' : undefined}
      >
        {label}
      </Link>
    );
  };

  return (
    <header
      className="sticky top-0 z-50 flex items-center justify-between px-6 py-4 border-b border-border bg-surface shadow-md"
      role="banner"
    >
      {/* Title */}
      <h1 className="font-echo text-vein text-2xl sm:text-3xl tracking-tight m-0">
        Stream of Conshushness
      </h1>

      {/* Main Nav */}
      <nav className="flex gap-2 items-center" aria-label="Primary">
        <NavItem to="/" label="🌊 Stream" />
        <NavItem to="/today" label="📍 Today" />
        <NavItem to="/calendar" label="📆 Calendar" />
        <NavItem to="/sections" label="🎛️ Sections" />
        {isAuthenticated && <NavItem to="/settings" label="⚙️ User Settings" />}

        {isAuthenticated && (
          <button
            type="button"
            onClick={logout}
            className="px-3 py-2 font-thread text-ink hover:text-vein border border-transparent hover:border-plum rounded-button transition-all"
          >
            Log Out
          </button>
        )}
      </nav>
    </header>
  );
}
