import { Link, useLocation } from 'react-router-dom';
import { createElement, useContext, useEffect, useRef, useState } from 'react';
import {
  CalendarDays,
  Inbox,
  MapPin,
  Menu,
  Search,
  UserCircle,
  Waves,
  X,
} from 'lucide-react';
import { AuthContext } from './AuthContext.jsx';
import axios from './api/axiosInstance';
import PrivateUploadImage from './components/PrivateUploadImage';
import ThemeToggle from './components/ThemeToggle.jsx';
import { requestErrorSummary } from './utils/requestError.js';
import './Main.css';
import './Header.css';

function isActivePath(pathname, to) {
  if (to === '/today') return pathname === '/today' || pathname.startsWith('/day/');
  return pathname === to;
}

function NavItem({ to, label, pathname, icon, mobileOptional = false }) {
  const active = isActivePath(pathname, to);
  return (
    <Link
      to={to}
      className={`nav-pill${active ? ' nav-pill--active' : ''}${mobileOptional ? ' nav-pill--mobile-optional' : ''}`}
      aria-current={active ? 'page' : undefined}
    >
      {createElement(icon, { size: 18, strokeWidth: 2, 'aria-hidden': true })}
      <span>{label}</span>
    </Link>
  );
}

export default function Header() {
  const location = useLocation();
  const { isAuthenticated, user: authenticatedUser } = useContext(AuthContext);
  const [user, setUser] = useState(authenticatedUser || null);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreButtonRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => setMoreOpen(false), [location.pathname]);

  useEffect(() => {
    if (!moreOpen) return undefined;
    const close = (event) => {
      if (event.key === 'Escape') {
        setMoreOpen(false);
        moreButtonRef.current?.focus();
      } else if (!menuRef.current?.contains(event.target) && event.target !== moreButtonRef.current) {
        setMoreOpen(false);
      }
    };
    window.addEventListener('keydown', close);
    window.addEventListener('pointerdown', close);
    return () => {
      window.removeEventListener('keydown', close);
      window.removeEventListener('pointerdown', close);
    };
  }, [moreOpen]);

  useEffect(() => {
    let cancelled = false;
    if (!isAuthenticated) {
      setUser(null);
      return undefined;
    }
    axios.get('/api/me')
      .then(({ data }) => {
        if (!cancelled) setUser(data.user);
      })
      .catch((error) => console.warn('[Header] profile unavailable:', requestErrorSummary(error)));
    return () => { cancelled = true; };
  }, [isAuthenticated, authenticatedUser]);

  return (
    <header className="app-header" role="banner">
      <Link to="/" className="app-header__brand" aria-label="StreamofConshushness home">
        <span className="app-header__mark" aria-hidden="true">〰</span>
        <span>StreamofConshushness</span>
      </Link>

      <nav className="primary-nav" aria-label="Primary navigation">
        <NavItem to="/" label="Stream" pathname={location.pathname} icon={Waves} />
        <NavItem to="/today" label="Today" pathname={location.pathname} icon={MapPin} />
        <NavItem to="/calendar" label="Calendar" pathname={location.pathname} icon={CalendarDays} />
        <NavItem to="/search" label="Search" pathname={location.pathname} icon={Search} mobileOptional />
        <NavItem to="/review" label="Review" pathname={location.pathname} icon={Inbox} mobileOptional />
      </nav>

      <div className="app-header__utilities">
        {isAuthenticated && (
          <Link to="/account" className="account-link" aria-label="Account">
            {user?.profilePicture ? (
              <PrivateUploadImage
                url={user.profilePicture}
                alt=""
                className="account-avatar"
                fallback={<UserCircle size={24} aria-hidden="true" />}
              />
            ) : (
              <UserCircle size={24} aria-hidden="true" />
            )}
            <span>Account</span>
          </Link>
        )}
        {isAuthenticated && (
          <button
            ref={moreButtonRef}
            type="button"
            className="mobile-menu-button"
            aria-expanded={moreOpen}
            aria-controls="more-navigation"
            aria-label={moreOpen ? 'Close more navigation' : 'Open more navigation'}
            onClick={() => setMoreOpen(open => !open)}
          >
            {moreOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
            <span>More</span>
          </button>
        )}
      </div>

      {isAuthenticated && (
        <nav
          ref={menuRef}
          id="more-navigation"
          className={`mobile-nav-panel${moreOpen ? ' mobile-nav-panel--open' : ''}`}
          aria-label="More navigation"
          hidden={!moreOpen}
        >
          <div className="mobile-nav-panel__mobile-links">
            <Link to="/search">Search</Link>
            <Link to="/review">Review Inbox</Link>
          </div>
          <Link to="/inbox/tasks">Tasks</Link>
          <Link to="/gather-lists">Gather lists</Link>
          <Link to="/interests">Interests</Link>
          <Link to="/sections">Sections</Link>
          <Link to="/clusters">Clusters</Link>
          <Link to="/goals">Goals</Link>
          <Link to="/ripples">Ripples</Link>
          <Link to="/trash">Trash</Link>
          <Link to="/export">Export</Link>
          <Link to="/settings">Settings</Link>
          {user?.isAdmin && <Link to="/admin">Admin</Link>}
          <div className="mobile-nav-panel__theme"><ThemeToggle variant="button" /></div>
        </nav>
      )}
    </header>
  );
}
