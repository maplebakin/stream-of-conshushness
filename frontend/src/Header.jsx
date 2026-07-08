// src/Header.jsx
import { Link, useLocation } from 'react-router-dom';
import { useContext, useState, useEffect } from 'react';
import { AuthContext } from './AuthContext.jsx';
import axios from './api/axiosInstance';
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
  if (to === '/ripples') {
    // /ripples and any child routes
    return pathname === '/ripples' || pathname.startsWith('/ripples/');
  }
  if (to === '/review') {
    return pathname === '/review';
  }
  if (to === '/search') {
    return pathname === '/search';
  }
  if (to === '/interests') {
    return pathname === '/interests' || pathname.startsWith('/interests/');
  }
  // exact match for everything else
  return pathname === to;
}

function NavItem({ to, label, pathname }) {
  const active = isActivePath(pathname, to);
  return (
    <Link
      to={to}
      className={`nav-pill${active ? ' nav-pill--active' : ''}`}
      aria-current={active ? 'page' : undefined}
    >
      {label}
    </Link>
  );
}

export default function Header() {
  const location = useLocation();
  const { isAuthenticated, logout } = useContext(AuthContext);
  const [user, setUser] = useState(null);

  useEffect(() => {
    if (!isAuthenticated) return;

    async function fetchUser() {
      try {
        const { data } = await axios.get('/api/me');
        setUser(data.user);
      } catch (e) {
        console.error('Failed to fetch user:', e);
      }
    }

    fetchUser();
  }, [isAuthenticated]);

  return (
    <header className="app-header" role="banner">
      {/* Title */}
      <h1 className="app-header__title">
        Stream of Conshushness
      </h1>

      {/* Main Nav */}
      <nav className="primary-nav" aria-label="Primary navigation">
        <NavItem to="/" label="🌊 Stream" pathname={location.pathname} />
        <NavItem to="/today" label="📍 Today" pathname={location.pathname} />
        <NavItem to="/review" label="Review" pathname={location.pathname} />
        <NavItem to="/calendar" label="📆 Calendar" pathname={location.pathname} />
        <NavItem to="/search" label="Search" pathname={location.pathname} />

        {isAuthenticated && user && (
          <Link
            to="/account"
            title="Account"
            className="account-link"
          >
            {user.profilePicture ? (
              <img
                src={user.profilePicture}
                alt={`${user.username}'s profile`}
                className="account-avatar"
              />
            ) : (
              <div className="account-avatar account-avatar--initial">
                {user.username?.[0]?.toUpperCase() || '?'}
              </div>
            )}
          </Link>
        )}

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
