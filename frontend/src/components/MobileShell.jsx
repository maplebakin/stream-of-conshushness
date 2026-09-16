import React from 'react';
import { CalendarDays, ChevronDown, LogOut, MapPin, Settings, UserCircle, Waves } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import PrivateUploadImage from './PrivateUploadImage.jsx';
import './MobileShell.css';

const PRIMARY_MOBILE_NAV = [
  { to: '/', label: 'Stream', icon: Waves },
  { to: '/today', label: 'Today', icon: MapPin },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays },
];

function isPrimaryRouteActive(pathname, to) {
  if (to === '/') return pathname === '/';
  if (to === '/today') return pathname === '/today' || pathname.startsWith('/day/');
  return pathname === to;
}

export function MobileBottomNav() {
  const { pathname } = useLocation();

  return (
    <nav className="mobile-bottom-nav" aria-label="Primary mobile navigation">
      {PRIMARY_MOBILE_NAV.map(({ to, label, icon }) => {
        const active = isPrimaryRouteActive(pathname, to);
        return (
          <Link
            key={to}
            to={to}
            className={`mobile-bottom-nav__link${active ? ' is-active' : ''}`}
            aria-current={active ? 'page' : undefined}
          >
            {React.createElement(icon, { size: 19, strokeWidth: active ? 2.4 : 2, 'aria-hidden': true })}
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function AccountAvatar({ user }) {
  if (user?.profilePicture) {
    return (
      <PrivateUploadImage
        url={user.profilePicture}
        alt=""
        className="account-avatar"
        fallback={<UserCircle size={23} aria-hidden="true" />}
      />
    );
  }

  return <UserCircle className="account-avatar-icon" size={24} aria-hidden="true" />;
}

export function AccountMenu({ user, onSignOut }) {
  const [open, setOpen] = React.useState(false);
  const menuRef = React.useRef(null);
  const toggleRef = React.useRef(null);
  const { pathname } = useLocation();

  React.useEffect(() => {
    setOpen(false);
  }, [pathname]);

  React.useEffect(() => {
    if (!open) return undefined;

    function handleOutsideOrEscape(event) {
      if (event.key === 'Escape') {
        setOpen(false);
        toggleRef.current?.focus();
        return;
      }
      if (!menuRef.current?.contains(event.target)) setOpen(false);
    }

    document.addEventListener('keydown', handleOutsideOrEscape);
    document.addEventListener('pointerdown', handleOutsideOrEscape);
    return () => {
      document.removeEventListener('keydown', handleOutsideOrEscape);
      document.removeEventListener('pointerdown', handleOutsideOrEscape);
    };
  }, [open]);

  return (
    <div className="account-menu" ref={menuRef}>
      <Link to="/account" className="account-link" aria-label="Account">
        <AccountAvatar user={user} />
        <span>Account</span>
      </Link>
      <button
        ref={toggleRef}
        type="button"
        className="account-menu__toggle"
        aria-label={open ? 'Close account menu' : 'Open account menu'}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="account-menu-popover"
        onClick={() => setOpen((current) => !current)}
      >
        <ChevronDown size={16} aria-hidden="true" />
      </button>

      {open && (
        <div id="account-menu-popover" className="account-menu__popover" role="menu" aria-label="Account menu">
          <div className="account-menu__identity">
            <strong>{user?.username || 'Your account'}</strong>
            {user?.email && <span>{user.email}</span>}
          </div>
          <Link role="menuitem" to="/account" onClick={() => setOpen(false)}>
            <UserCircle size={17} aria-hidden="true" />
            Account
          </Link>
          <Link role="menuitem" to="/settings" onClick={() => setOpen(false)}>
            <Settings size={17} aria-hidden="true" />
            Settings
          </Link>
          <button
            type="button"
            role="menuitem"
            className="account-menu__sign-out"
            onClick={() => {
              setOpen(false);
              onSignOut?.();
            }}
          >
            <LogOut size={17} aria-hidden="true" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
