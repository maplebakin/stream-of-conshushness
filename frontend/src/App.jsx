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






function AppRoutes() {
  const { isAuthenticated } = useContext(AuthContext);

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      {isAuthenticated ? (
        <>
          <Route path="/" element={<MainPage />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/day/:date" element={<DailyPage />} />
          <Route path="/section/games" element={<GameList />} />
          <Route path="/section/games/:slug" element={<GamePage />} />v
          <Route path="/section/:sectionName" element={<SectionPage />} />
          <Route path="/sections" element={<SectionsPage />} />
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
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}
