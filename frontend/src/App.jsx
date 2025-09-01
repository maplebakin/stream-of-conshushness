// frontend/src/App.jsx
import React, { useContext } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import './variables.css';
import './DesignSystem.css'
// Pages / Layout
import MainPage from './MainPage.jsx';
import DailyPage from './DailyPage.jsx';
import Calendar from './Calendar.jsx';
import Login from './Login.jsx';
import RegisterPage from './RegisterPage.jsx';
import GameList from './GameList.jsx';
import GamePage from './GamePage.jsx';

import SectionPage from './pages/SectionPage.jsx';            // landing + section detail
import SectionPageRoom from './pages/SectionPageRoom.jsx';    // NEW: page room under a section
import ClustersIndex from './pages/ClustersIndex.jsx';        // clusters index
import ClusterRoom from './pages/ClusterRoom.jsx';            // per-cluster room

import RippleReviewUI from './RippleReviewUI';
import Layout from './Layout.jsx';
import SuggestedTasksInbox from './SuggestedTasksInbox.jsx';
import InboxTasksPage from './pages/InboxTasksPage.jsx';
import Account from './pages/Account.jsx';
import UserSettings from './pages/UserSettings.jsx';
import AdminPanel from './pages/AdminPanel.jsx';
import AdapterHarness from './adapters/AdapterHarness.jsx';

// Auth / Search Contexts
import { AuthProvider, AuthContext } from './AuthContext.jsx';
import { SearchProvider } from './SearchContext.jsx';

// Password reset pages
import ForgotPassword from './pages/ForgotPassword.jsx';
import ResetPassword from './pages/ResetPassword.jsx';

/* Helper: redirect to "today" using local time (Toronto normalization happens server-side) */
function todayISO() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
function TodayRedirect() {
  return <Navigate to={`/day/${todayISO()}`} replace />;
}

function AppRoutes() {
  const { isAuthenticated } = useContext(AuthContext);

  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/forgot" element={<ForgotPassword />} />
      <Route path="/reset" element={<ResetPassword />} />

      {/* Authed routes */}
      {isAuthenticated ? (
        <Route element={<Layout />}>
          <Route path="/" element={<MainPage />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/today" element={<TodayRedirect />} />
          <Route path="/day/:date" element={<DailyPage />} />
          <Route path="/_adapters" element={<AdapterHarness />} />

          {/* Sections */}
          <Route path="/sections" element={<SectionPage />} />                 {/* landing */}
          <Route path="/sections/:key" element={<SectionPage />} />            {/* section detail */}
          <Route path="/sections/:sectionSlug/:pageSlug" element={<SectionPageRoom />} />             {/* room default -> journal */}
          <Route path="/sections/:sectionSlug/:pageSlug/:tab" element={<SectionPageRoom />} />        {/* room tabbed */}

          {/* Clusters */}
          <Route path="/clusters" element={<ClustersIndex />} />
          <Route path="/clusters/:clusterSlug" element={<ClusterRoom />} />    {/* param name matches ClusterRoom */}

          {/* Games */}
          <Route path="/section/games" element={<GameList />} />
          <Route path="/section/games/:slug" element={<GamePage />} />

          {/* Utilities */}
          <Route path="/ripples" element={<RippleReviewUI />} />
          <Route path="/inbox/tasks" element={<InboxTasksPage />} />
          <Route path="/inbox/tasks/:date" element={<InboxTasksPage />} />
          <Route path="/admin" element={<AdminPanel />} />

          <Route path="/account" element={<Account />} />
          <Route path="/settings" element={<UserSettings />} />

          {/* 404 inside authed shell */}
          <Route path="*" element={<div style={{ padding: 32 }}>Not found.</div>} />
        </Route>
      ) : (
        <Route path="*" element={<Navigate to="/login" replace />} />
      )}
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <SearchProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </SearchProvider>
    </AuthProvider>
  );
}
