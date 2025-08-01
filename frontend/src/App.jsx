import React, { useContext } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
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
import { SearchProvider } from "./SearchContext.jsx";



function AppRoutes() {
  const { isAuthenticated } = useContext(AuthContext);

  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      {/* Authenticated (main app) routes, wrapped in Layout */}
      {isAuthenticated ? (
        <>
          <Route element={<Layout />}>
            <Route path="*" element={<div style={{ padding: 32 }}>Not found.</div>} />
            <Route path="/" element={<MainPage />} />
            <Route path="/calendar" element={<Calendar />} />
            <Route path="/day/:date" element={<DailyPage />} />
            <Route path="/section/games" element={<GameList />} />
            <Route path="/section/games/:slug" element={<GamePage />} />
            <Route path="/section/:sectionName" element={<SectionPage />} />
            <Route path="/sections" element={<SectionsPage />} />
            <Route path="/section/:sectionName/:pageSlug" element={<SectionPageView />} />
            <Route path="/ripples" element={<RippleReviewUI />} />
            <Route path="*" element={<div style={{ padding: 32 }}>Not found.</div>} />
          </Route>
          {/* (Optional) Add a catch-all 404 page for logged-in users here */}
        </>
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