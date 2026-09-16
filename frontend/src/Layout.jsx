import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Header from './Header.jsx';
import './Main.css';

function routeProvidesMainLandmark(pathname) {
  return pathname === '/' ||
    pathname === '/calendar' ||
    pathname === '/account' ||
    pathname === '/trash' ||
    pathname.startsWith('/day/') ||
    /^\/sections\/[^/]+/.test(pathname);
}

export default function Layout() {
  const { pathname } = useLocation();
  const ContentRoot = routeProvidesMainLandmark(pathname) ? 'div' : 'main';

  return (
    <div className="app-layout app-layout--focused">
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <Header />
      <div className="app-body app-body--focused">
        <ContentRoot id="main-content" className="app-main" tabIndex={-1}>
          <div className="app-content">
            <Outlet />
          </div>
        </ContentRoot>
      </div>
    </div>
  );
}
