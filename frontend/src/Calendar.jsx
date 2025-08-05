// frontend/src/Calendar.jsx

import { useState, useEffect, useContext } from 'react';
import { AuthContext } from './AuthContext.jsx';
import axios from './api/axiosInstance';
import './Calendar.css';

export default function Calendar() {
  const { token } = useContext(AuthContext);
  const [appointments, setAppointments] = useState([]);
  const [importantEvents, setImportantEvents] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  const today = new Date().toISOString().split('T')[0];

  useEffect(() => {
    if (!token) return;
    axios
      .get('/api/appointments', {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => setAppointments(res.data || []))
      .catch((err) => console.error('Error loading appointments:', err));

    axios
      .get('/api/events', {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => setImportantEvents(res.data || []))
      .catch((err) => console.error('Error loading important events:', err));
  }, [token]);

  const handleToday = () => {
    const now = new Date();
    setSelectedMonth(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  };

  const changeMonth = (direction) => {
    const [year, month] = selectedMonth.split('-').map(Number);
    const newDate = new Date(year, month - 1 + direction, 1);
    setSelectedMonth(`${newDate.getFullYear()}-${String(newDate.getMonth() + 1).padStart(2, '0')}`);
  };

  const renderCalendarGrid = () => {
    const [year, month] = selectedMonth.split('-').map(Number);
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);
    const daysInMonth = lastDay.getDate();
    const startWeekday = firstDay.getDay(); // 0 (Sun) to 6 (Sat)

    const days = [];

    for (let i = 0; i < startWeekday; i++) {
      days.push(<div key={`empty-${i}`} className="calendar-day empty"></div>);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const isToday = dateStr === today;

      days.push(
        <div key={dateStr} className={`calendar-day ${isToday ? 'today' : ''}`}>
          <div className="date-label">{day}</div>
        </div>
      );
    }

    return days;
  };

  return (
    <div className="calendar-page">
      <div className="calendar-layout">
        <aside className="calendar-page__sidebar">
          <h3>Important Events</h3>
          <ul className="important-event-list">
            {importantEvents.map((event) => (
              <li key={event._id}>
                <span>{event.title}</span>
                <span>{Math.ceil((new Date(event.date) - new Date()) / (1000 * 60 * 60 * 24))} Days</span>
              </li>
            ))}
          </ul>
        </aside>

        <div className="calendar-page__content">
          <div className="calendar-header">
            <div className="calendar-controls">
              <button onClick={() => changeMonth(-1)}>‹</button>
              <h2>{new Date(selectedMonth + '-01').toLocaleDateString(undefined, { year: 'numeric', month: 'long' })}</h2>
              <button onClick={() => changeMonth(1)}>›</button>
            </div>
            <div className="calendar-actions">
              <button className="btn" onClick={handleToday}>Today</button>
              <button className="btn">+ Add Appointment</button>
            </div>
          </div>

          <div className="calendar-grid">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
              <div key={day} className="day-of-week">{day}</div>
            ))}
            {renderCalendarGrid()}
          </div>
        </div>
      </div>
    </div>
  );
}
