// frontend/src/Layout.jsx
import React, { useContext } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import Header from './Header.jsx';
import ThemeToggle from './components/ThemeToggle.jsx';
import { AuthContext } from './AuthContext.jsx';
import './Main.css';
import './Sidebar.css';

export default function Layout() {
  const { pathname } = useLocation();
  const { user } = useContext(AuthContext);

  // Pages that render their own sidebar should suppress the global right sidebar.
  const hideRightSidebar = pathname.startsWith('/calendar');

  const linkClass = ({ isActive }) =>
    `nav-link${isActive ? ' active' : ''}`;

  const bodyClass = `app-body${hideRightSidebar ? ' no-right-sidebar' : ''}`;

  return (
    <div className={`app-layout ${hideRightSidebar ? 'no-right-sidebar' : ''}`}>
      {/* Sticky site header */}
      <Header />

      {/* Main body with optional right sidebar */}
      <div className={bodyClass}>
        <main className="app-main">
          <section className="app-content">
            <Outlet />
          </section>
        </main>

        {!hideRightSidebar && (
          <aside
            className="section-sidebar section-sidebar--right"
            aria-label="Secondary navigation"
          >
            <div className="sidebar-inner">
              <h2 className="sidebar-title">Navigate</h2>
              <ul className="sidebar-nav">
                <li>
                  <NavLink to="/" end className={linkClass} title="Stream">
                    🌊 <span>Stream</span>
                  </NavLink>
                </li>
                <li>
                  <NavLink to="/sections" className={linkClass} title="Sections">
                    🗂️ <span>Sections</span>
                  </NavLink>
                </li>
                <li>
                  <NavLink to="/clusters" className={linkClass} title="Clusters">
                    🧩 <span>Clusters</span>
                  </NavLink>
                </li>
                <li>
                  <NavLink to="/ripples" className={linkClass} title="Ripples">
                    💡 <span>Ripples</span>
                  </NavLink>
                </li>
                <li>
                  <NavLink to="/inbox/tasks" className={linkClass} title="Task Inbox">
                    ✅ <span>Task Inbox</span>
                  </NavLink>
                </li>
              </ul>

              <div className="sidebar-sep" />

              <ul className="sidebar-nav">
                <li>
                  <NavLink to="/calendar" className={linkClass} title="Calendar">
                    📆 <span>Calendar</span>
                  </NavLink>
                </li>
              </ul>

              <div className="sidebar-sep" />

              <ul className="sidebar-nav">
                <li>
                  <NavLink to="/habits/analytics" className={linkClass} title="Habit Analytics">
                    📊 <span>Habit Analytics</span>
                  </NavLink>
                </li>
                <li>
                  <NavLink to="/search" className={linkClass} title="Search">
                    🔍 <span>Search</span>
                  </NavLink>
                </li>
                <li>
                  <NavLink to="/trash" className={linkClass} title="Trash">
                    🗑️ <span>Trash</span>
                  </NavLink>
                </li>
              </ul>

              <div className="sidebar-sep" />

              <ul className="sidebar-nav">
                <li>
                  <NavLink to="/export" className={linkClass} title="Export Data">
                    📦 <span>Export</span>
                  </NavLink>
                </li>
                <li>
                  <NavLink to="/account" className={linkClass} title="Account">
                    👤 <span>Account</span>
                  </NavLink>
                </li>
                <li>
                  <NavLink to="/settings" className={linkClass} title="Settings">
                    ⚙️ <span>Settings</span>
                  </NavLink>
                </li>
                {user?.isAdmin && (
                  <li>
                    <NavLink to="/admin" className={linkClass} title="Admin Panel">
                      🔐 <span>Admin Panel</span>
                    </NavLink>
                  </li>
                )}
              </ul>

              <div className="sidebar-sep" />

              {/* Theme Toggle */}
              <div style={{ padding: '0.5rem' }}>
                <ThemeToggle variant="button" />
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
