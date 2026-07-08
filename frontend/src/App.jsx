// frontend/src/App.jsx
import React, { lazy, Suspense, useContext, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import CommandPalette from './components/CommandPalette.jsx';
import useKeyboardShortcuts from './hooks/useKeyboardShortcuts.js';

import './variables.css';
import './DesignSystem.css'

// Auth / Search / Theme / Toast Contexts
import { AuthProvider, AuthContext } from './AuthContext.jsx';
import { SearchProvider } from './SearchContext.jsx';
import { ThemeProvider } from './ThemeContext.jsx';
import { ToastProvider } from './ToastContext.jsx';

import { todayISOInToronto } from './utils/date.js';

// Route modules are lazy-loaded to keep the first app chunk focused on shell/auth state.
const Layout = lazy(() => import('./Layout.jsx'));
const MainPage = lazy(() => import('./MainPage.jsx'));
const DailyPage = lazy(() => import('./DailyPage.jsx'));
const Calendar = lazy(() => import('./Calendar.jsx'));
const GoalPage = lazy(() => import('./GoalPage.jsx'));
const Login = lazy(() => import('./Login.jsx'));
const RegisterPage = lazy(() => import('./RegisterPage.jsx'));
const GameList = lazy(() => import('./GameList.jsx'));
const GamePage = lazy(() => import('./GamePage.jsx'));
const RippleReviewUI = lazy(() => import('./RippleReviewUI.jsx'));
const AdapterHarness = lazy(() => import('./adapters/AdapterHarness.jsx'));
const SectionsIndex = lazy(() => import('./pages/SectionsIndex.jsx'));
const SectionPage = lazy(() => import('./pages/SectionPage.jsx'));
const SectionPageRoom = lazy(() => import('./pages/SectionPageRoom.jsx'));
const ClustersIndex = lazy(() => import('./pages/ClustersIndex.jsx'));
const ClusterRoom = lazy(() => import('./pages/ClusterRoom.jsx'));
const GatherListsPage = lazy(() => import('./pages/GatherListsPage.jsx'));
const InterestsPage = lazy(() => import('./pages/InterestsPage.jsx'));
const InboxTasksPage = lazy(() => import('./pages/InboxTasksPage.jsx'));
const Account = lazy(() => import('./pages/Account.jsx'));
const UserSettings = lazy(() => import('./pages/UserSettings.jsx'));
const AdminPanel = lazy(() => import('./pages/AdminPanel.jsx'));
const ExportData = lazy(() => import('./pages/ExportData.jsx'));
const GlobalSearch = lazy(() => import('./pages/GlobalSearch.jsx'));
const HabitAnalytics = lazy(() => import('./pages/HabitAnalytics.jsx'));
const ReviewInbox = lazy(() => import('./pages/ReviewInbox.jsx'));
const TrashPage = lazy(() => import('./pages/TrashPage.jsx'));
const ResearchSectionPage = lazy(() => import('./pages/ResearchSectionPage.jsx'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword.jsx'));
const ResetPassword = lazy(() => import('./pages/ResetPassword.jsx'));

/* Helper: redirect to "today" using local time (Toronto normalization happens server-side) */
function TodayRedirect() {
  return <Navigate to={`/day/${todayISOInToronto()}`} replace />;
}

function AppRoutes() {
  const { isAuthenticated } = useContext(AuthContext);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  // Global keyboard shortcuts
  useKeyboardShortcuts([
    {
      key: 'k',
      ctrl: true,
      action: () => setCommandPaletteOpen(true),
      allowInInputs: true
    }
  ]);

  return (
    <>
      <CommandPalette
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
      />
      <Suspense fallback={<div className="page">Loading...</div>}>
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
          <Route path="/goals" element={<GoalPage />} />
          <Route path="/today" element={<TodayRedirect />} />
          <Route path="/day/:date" element={<DailyPage />} />
          <Route path="/_adapters" element={<AdapterHarness />} />

          {/* Sections */}
          <Route path="/sections" element={<SectionsIndex />} />               {/* landing */}
          <Route path="/sections/:key" element={<SectionPage />} />            {/* section detail */}
          <Route path="/sections/:sectionSlug/:pageSlug" element={<SectionPageRoom />} />             {/* room default -> journal */}
          <Route path="/sections/:sectionSlug/:pageSlug/:tab" element={<SectionPageRoom />} />        {/* room tabbed */}

          {/* Research projects */}
          <Route path="/research/:sectionKey" element={<ResearchSectionPage />} />

          {/* Clusters */}
          <Route path="/clusters" element={<ClustersIndex />} />
          <Route path="/clusters/:clusterSlug" element={<ClusterRoom />} />    {/* param name matches ClusterRoom */}

          <Route path="/gather-lists" element={<GatherListsPage />} />
          <Route path="/interests" element={<InterestsPage />} />

          {/* Games */}
          <Route path="/section/games" element={<GameList />} />
          <Route path="/section/games/:slug" element={<GamePage />} />

          {/* Utilities */}
          <Route path="/review" element={<ReviewInbox />} />
          <Route path="/ripples" element={<RippleReviewUI />} />
          <Route path="/inbox/tasks" element={<InboxTasksPage />} />
          <Route path="/inbox/tasks/:date" element={<InboxTasksPage />} />
          <Route path="/admin" element={<AdminPanel />} />

          <Route path="/account" element={<Account />} />
          <Route path="/settings" element={<UserSettings />} />
          <Route path="/export" element={<ExportData />} />
          <Route path="/search" element={<GlobalSearch />} />
          <Route path="/habits/analytics" element={<HabitAnalytics />} />
          <Route path="/trash" element={<TrashPage />} />

          {/* 404 inside authed shell */}
          <Route path="*" element={<div style={{ padding: 32 }}>Not found.</div>} />
        </Route>
      ) : (
        <Route path="*" element={<Navigate to="/login" replace />} />
      )}
      </Routes>
      </Suspense>
    </>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ToastProvider>
          <SearchProvider>
            <BrowserRouter>
              <AppRoutes />
            </BrowserRouter>
          </SearchProvider>
        </ToastProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
