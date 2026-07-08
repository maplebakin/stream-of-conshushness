// frontend/src/Layout.jsx
import React, { useContext, useEffect, useState } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import Header from './Header.jsx';
import ThemeToggle from './components/ThemeToggle.jsx';
import { AuthContext } from './AuthContext.jsx';
import { listReviewItems } from './api/review.js';
import './Main.css';
import './Sidebar.css';

export default function Layout() {
  const { pathname } = useLocation();
  const { user } = useContext(AuthContext);
  const [reviewCount, setReviewCount] = useState(0);

  // Pages that render their own sidebar should suppress the global right sidebar.
  const hideRightSidebar =
    pathname.startsWith('/calendar') ||
    pathname === '/today' ||
    pathname.startsWith('/day/');

  const linkClass = ({ isActive }) =>
    `nav-link${isActive ? ' active' : ''}`;

  const bodyClass = `app-body${hideRightSidebar ? ' no-right-sidebar' : ''}`;

  useEffect(() => {
    let ignore = false;
    if (!user) {
      setReviewCount(0);
      return () => { ignore = true; };
    }

    listReviewItems({ limit: 1 })
      .then(({ counts }) => {
        if (!ignore) setReviewCount(Number(counts?.total) || 0);
      })
      .catch((error) => {
        console.warn('[Layout] review count failed:', error?.response?.data || error.message);
        if (!ignore) setReviewCount(0);
      });

    return () => { ignore = true; };
  }, [user, pathname]);

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
              <h2 className="sidebar-title">Review</h2>
              <ul className="sidebar-nav">
                <li>
                  <NavLink to="/review" className={linkClass} title="Review Inbox">
                    <span>Review Inbox</span>
                    {reviewCount > 0 && <strong className="sidebar-badge">{reviewCount}</strong>}
                  </NavLink>
                </li>
              </ul>

              <div className="sidebar-sep" />

              <h2 className="sidebar-title">Organize</h2>
              <ul className="sidebar-nav">
                <li>
                  <NavLink to="/inbox/tasks" className={linkClass} title="Tasks">
                    ✅ <span>Tasks</span>
                  </NavLink>
                </li>
                <li>
                  <NavLink to="/gather-lists" className={linkClass} title="Gather Lists">
                    🧺 <span>Gather</span>
                  </NavLink>
                </li>
                <li>
                  <NavLink to="/interests" className={linkClass} title="Sparks & Interests">
                    ✨ <span>Interests</span>
                  </NavLink>
                </li>
                <li>
                  <NavLink to="/ripples" className={linkClass} title="Ripples">
                    💡 <span>Ripples</span>
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
                  <NavLink to="/goals" className={linkClass} title="Goals">
                    🎯 <span>Goals</span>
                  </NavLink>
                </li>
              </ul>

              <div className="sidebar-sep" />

              <h2 className="sidebar-title">Utility</h2>
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
