// src/Layout.jsx
import React from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import Header from './Header.jsx';
import './Main.css';
import './Sidebar.css';

export default function Layout() {
  const { pathname } = useLocation();

  // Pages that render their own sidebar should suppress the global right sidebar.
  // Start with calendar; you can add more routes (e.g., /day) if you like.
  const hideRightSidebar =
    pathname.startsWith('/calendar');

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
            <nav>
              <h2 className="sidebar-title">Navigate</h2>
              <ul className="sidebar-nav">
                <li><NavLink to="/" end className={({ isActive }) => isActive ? 'active' : ''}>Stream</NavLink></li>
                <li><NavLink to="/sections" className={({ isActive }) => isActive ? 'active' : ''}>Sections</NavLink></li>
                <li><NavLink to="/clusters" className={({ isActive }) => isActive ? 'active' : ''}>Clusters</NavLink></li>
                <li><NavLink to="/ripples" className={({ isActive }) => isActive ? 'active' : ''}>Ripples</NavLink></li>
                <li><NavLink to="/inbox/tasks" className={({ isActive }) => isActive ? 'active' : ''}>Task Inbox</NavLink></li>
              </ul>
            </nav>
          </aside>
        )}
      </div>
    </div>
  );
}
