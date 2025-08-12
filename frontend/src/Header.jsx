// src/Header.jsx
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
      className={`px-4 py-2 rounded-button font-thread transition-all ${
        location.pathname === to
          ? 'bg-plum text-mist shadow-soft'
          : 'text-ink hover:bg-thread hover:text-mist'
      }`}
      aria-current={location.pathname === to ? 'page' : undefined}
    >
      {label}
    </Link>
  );

  return (
    <header className="sticky top-0 z-50 flex items-center justify-between px-6 py-4 border-b border-border bg-surface shadow-md">
      <h1 className="font-echo text-vein text-2xl sm:text-3xl tracking-tight">
        Stream of Conshushness
      </h1>
      <nav className="flex gap-2 items-center">
        {navLink("/", "🌊 Stream")}
        {navLink("/today", "📍 Today")}
        {navLink("/calendar", "📆 Calendar")}
        {navLink("/sections", "🎛️ Sections")}
        {isAuthenticated && (
          <button
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
