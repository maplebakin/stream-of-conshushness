import React, { useContext } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import MainPage from './MainPage.jsx';
import DailyPage from './DailyPage.jsx';
import Calendar from './Calendar.jsx';
import LoginPage from './LoginPage.jsx';
import RegisterPage from './RegisterPage.jsx';
import { AuthContext } from './AuthContext.jsx';

export default function App() {
  const { isAuthenticated } = useContext(AuthContext);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        {isAuthenticated ? (
          <>
            <Route path="/" element={<MainPage />} />
            <Route path="/calendar" element={<Calendar />} />
           <Route path="/day/:date" element={<DailyPage />} />

          </>
        ) : (
          <Route path="*" element={<Navigate to="/login" replace />} />
        )}
      </Routes>
    </BrowserRouter>
  );
}
