// App.jsx
import React, { useContext } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import './variables.css';
import MainPage from './MainPage.jsx';
import DailyPage from './DailyPage.jsx';
import Calendar from './Calendar.jsx';
import LoginPage from './LoginPage.jsx';
import RegisterPage from './RegisterPage.jsx';
import { AuthProvider, AuthContext } from './AuthContext.jsx';
import GameList from './GameList.jsx';
import GamePage from './GamePage.jsx';
import SectionPage from './SectionPage.jsx';
import SectionsPage from './SectionsPage.jsx';
import SectionPageView from './SectionPageView.jsx';
import RippleReviewUI from './RippleReviewUI';
import Layout from './Layout.jsx';
import { SearchProvider } from './SearchContext.jsx';
import SuggestedTasksInbox from './SuggestedTasksInbox.jsx';

/* Local helper to redirect to today in local time */
function todayISO() {
  const now = new Date(); // local time (no UTC flip)
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
      {/* Public */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      {/* Authed */}
      {isAuthenticated ? (
        <Route element={<Layout />}>
          <Route path="/" element={<MainPage />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/today" element={<TodayRedirect />} />
          <Route path="/day/:date" element={<DailyPage />} />
          <Route path="/section/games" element={<GameList />} />
          <Route path="/section/games/:slug" element={<GamePage />} />
          <Route path="/sections" element={<SectionsPage />} />
          <Route path="/section/:sectionName" element={<SectionPage />} />
          <Route path="/section/:sectionName/:pageSlug" element={<SectionPageView />} />
          <Route path="/ripples" element={<RippleReviewUI />} />
          <Route path="/inbox/tasks" element={<SuggestedTasksInbox />} />
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
