// Updated Calendar.jsx structure to match Calendar.css with namespacing
// File: frontend/src/pages/Calendar.jsx

import React, { useState, useEffect } from 'react';
import {
  ChevronLeft, ChevronRight, Plus, Trash2, Home, X
} from 'lucide-react';

import './Calendar.css';

export default function Calendar() {
  const getTodayISO = () => new Date().toISOString().slice(0, 10);
  const todayStr = getTodayISO();
  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const [selectedMonth, setSelectedMonth] = useState(defaultMonth);
  const [calendarData, setCalendarData] = useState({});
  const [importantEvents, setImportantEvents] = useState([]);

  useEffect(() => {
    setTimeout(() => {
      setCalendarData({
        [selectedMonth]: {
          days: {
            [`${selectedMonth}-05`]: {
              entries: [{ content: 'Mock Entry' }],
              tasks: [{ details: 'Mock Task' }]
            }
          }
        }
      });

      setImportantEvents([
        { _id: '1', title: 'Project Deadline', date: `${selectedMonth}-25` },
        { _id: '2', title: 'Team Offsite', date: `${selectedMonth}-30` }
      ]);
    }, 500);
  }, [selectedMonth]);

  const getDaysUntil = (dateStr) => {
    const eventDate = new Date(dateStr);
    const today = new Date(todayStr);
    const diff = Math.round((eventDate - today) / 86400000);
    if (diff === 0) return { label: 'Today', class: 'text-blue-600 bg-blue-100' };
    if (diff === 1) return { label: 'Tomorrow', class: 'text-green-600 bg-green-100' };
    if (diff > 1) return { label: `${diff} Days`, class: 'text-gray-600 bg-gray-100' };
    return { label: `${Math.abs(diff)} Ago`, class: 'text-red-600 bg-red-100' };
  };

  const changeMonth = (dir) => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const next = new Date(y, m - 1 + dir);
    setSelectedMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`);
  };

  const [year, month] = selectedMonth.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const firstWeekday = new Date(year, month - 1, 1).getDay();
  const monthData = calendarData[selectedMonth]?.days || {};

  return (
    <div className="calendar-page">
      <header>
        <h1>Calendar</h1>
        <nav>
          <button onClick={() => setSelectedMonth(defaultMonth)} className="today-btn">
            <Home size={16} /> Today
          </button>
        </nav>
      </header>

      <div className="calendar-layout">
        {/* Sidebar */}
        <aside className="calendar-page__sidebar important-events">
          <h3>Important Events</h3>
          <ul className="important-event-list">
            {importantEvents.map(evt => {
              const badge = getDaysUntil(evt.date);
              return (
                <li key={evt._id}>
                  <span>{evt.title}</span>
                  <span className={badge.class}>{badge.label}</span>
                </li>
              );
            })}
          </ul>
        </aside>

        {/* Main Calendar */}
        <div className="calendar-page__content calendar-content">
          <div className="calendar-header">
            <button className="nav-btn" onClick={() => changeMonth(-1)}><ChevronLeft size={16} /></button>
            <h2>{new Date(year, month - 1).toLocaleString('default', { month: 'long', year: 'numeric' })}</h2>
            <button className="nav-btn" onClick={() => changeMonth(1)}><ChevronRight size={16} /></button>
          </div>

          <div className="calendar-grid">
            {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(day => (
              <div key={day} className="day-of-week">{day}</div>
            ))}

            {Array.from({ length: firstWeekday }).map((_, i) => (
              <div key={`empty-${i}`} className="calendar-day empty" />
            ))}

            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const data = monthData[dateStr] || {};
              const isToday = dateStr === todayStr;

              return (
                <div key={dateStr} className={`calendar-day ${isToday ? 'today' : ''}`}>
                  <div className="date-label">{day}</div>
                  {data.entries && <div className="text-xs text-purple-600">📝 {data.entries.length}</div>}
                  {data.tasks && <div className="text-xs text-green-600">✅ {data.tasks.length}</div>}
                </div>
              );
            })}
          </div>
        </div>

        <div className="calendar-sidebar">
          <div className="month-tabs">
            {[...Array(12).keys()].map(i => {
              const m = String(i + 1).padStart(2, '0');
              const key = `${year}-${m}`;
              return (
                <button key={key} onClick={() => setSelectedMonth(key)}
                  className={`month-tab ${key === selectedMonth ? 'active' : ''}`}>
                  <span className="collapsed-label">{m}</span>
                  <span className="expanded-label">{new Date(year, i).toLocaleString('default', { month: 'long' })}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
