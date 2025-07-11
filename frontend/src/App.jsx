import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import MainPage from './MainPage';
import Calendar from './Calendar';
import DailyPage from './DailyPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MainPage />} />
        <Route path="/calendar" element={<Calendar />} />
        <Route path="/day/:date" element={<DailyPage />} />

      </Routes>
    </BrowserRouter>
  );
}
