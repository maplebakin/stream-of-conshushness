// frontend/src/Layout.jsx
import React from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import Header from './Header.jsx';
import './Main.css';
import './Sidebar.css';

export default function Layout() {
  const { pathname } = useLocation();

  // Pages that render their own sidebar should suppress the global right sidebar.
  const hideRightSidebar = pathname.startsWith('/calendar');

  const linkClass = ({ isActive }) =>
    `nav-link${isActive ? ' active' : ''}`;

  return (
    <div className={`app-layout ${hideRightSidebar ? 'no-right-sidebar' : ''}`}>
      {/* Sticky site header */}
      <Header />

      {/* Main body with optional right sidebar */}
      <div className="app-body">
        <main className="app-main">
          <section className="app-content">
            <Outlet />
          </section>
        </main>

        {!hideRightSidebar && (
          <aside className="section-sidebar section-sidebar--right">
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
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
