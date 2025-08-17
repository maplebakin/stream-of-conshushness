// frontend/src/App.jsx
import React, { useContext } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import './variables.css';

// Pages / Layout
import MainPage from './MainPage.jsx';
import DailyPage from './DailyPage.jsx';
import Calendar from './Calendar.jsx';
import Login from './Login.jsx';
import RegisterPage from './RegisterPage.jsx';
import GameList from './GameList.jsx';
import GamePage from './GamePage.jsx';
import SectionPage from './SectionPage.jsx';
import SectionsPage from './SectionsPage.jsx';
import SectionPageView from './SectionPageView.jsx';
import RippleReviewUI from './RippleReviewUI';
import Layout from './Layout.jsx';
import SuggestedTasksInbox from './SuggestedTasksInbox.jsx';
import InboxTasksPage from './pages/InboxTasksPage.jsx';

// Auth / Search Contexts
import { AuthProvider, AuthContext } from './AuthContext.jsx';
import { SearchProvider } from './SearchContext.jsx';
import AdminPanel from './pages/AdminPanel.jsx';

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

          {/* Sections / Games */}
          <Route path="/sections" element={<SectionsPage />} />
          <Route path="/section/:sectionName" element={<SectionPage />} />
          <Route path="/section/:sectionName/:pageSlug" element={<SectionPageView />} />
          <Route path="/section/games" element={<GameList />} />
          <Route path="/section/games/:slug" element={<GamePage />} />
          <Route path="/admin" element={<AdminPanel />} />

          {/* Utilities */}
          <Route path="/ripples" element={<RippleReviewUI />} />
          <Route path="/inbox/tasks" element={<InboxTasksPage />} />
          <Route path="/inbox/tasks/:date" element={<InboxTasksPage />} />

          {/* 404 inside authed shell */}
          <Route path="*" element={<div style={{ padding: 32 }}>Not found.</div>} />
        </Route>
      ) : (
        /* Anything else when not authed goes to login */
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
