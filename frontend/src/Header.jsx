import { Link, useLocation } from 'react-router-dom';
import './Main.css';
import { useContext } from 'react';
import { AuthContext } from './AuthContext.jsx';

export default function Header() {
  const location = useLocation();
  const { isAuthenticated, logout } = useContext(AuthContext);

  const navLink = (to, label) => (
    <Link to={to} className={location.pathname === to ? 'active' : ''}>
      {label}
    </Link>
  );

  return (
    <header>
      <h1>Stream of Conshushness</h1>
      <nav>
        {navLink("/", "Home")}
        {navLink("/calendar", "Calendar")}
        {navLink("/sections", "Manage Sections")}
        {isAuthenticated && (
          <button onClick={logout} style={{ marginLeft: 12 }}>
            Log Out
          </button>
        )}
      </nav>
    </header>
  );
}
