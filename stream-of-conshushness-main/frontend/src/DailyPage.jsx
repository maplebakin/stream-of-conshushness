import { useParams, Link } from 'react-router-dom';
import './dailypage.css';
import HourlySchedule from './HourlySchedule';
import React, { useState, useEffect, useContext } from 'react';
import TopPriorities from './TopPriorities';

import NotesSection from './NotesSection';
import EntriesSection from './EntriesSection';
import axios from './api/axiosInstance';
import { AuthContext } from './AuthContext.jsx';

function DailyPage() {
  const { date } = useParams();
  const { token } = useContext(AuthContext);
  const [importantEvents, setImportantEvents] = useState([]);
const [loading, setLoading] = useState(false);

  // NEW: Schedule open/closed state
  const [isScheduleOpen, setIsScheduleOpen] = useState(true);

  useEffect(() => {
    // Set default open/closed based on screen size
    if (window.innerWidth < 800) {
      setIsScheduleOpen(false);
    } else {
      setIsScheduleOpen(true);
    }
  }, []);

  const toggleSchedule = () => {
    setIsScheduleOpen(prev => !prev);
  };

  useEffect(() => {
    if (!date || !token) return;

    axios.get(`/api/important-events/${date.slice(0, 7)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    .then(res => {
      const filtered = (res.data || []).filter(ev => ev.date === date);
      setImportantEvents(filtered);
    })
    .catch(() => setImportantEvents([]));
  }, [date, token]);

  const [yyyy, mm, dd] = date.split('-');
  const formattedDate = new Date(
    Number(yyyy),
    Number(mm) - 1,
    Number(dd)
  ).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'

    
  });
const [appointments, setAppointments] = useState([]);

useEffect(() => {
  if (!date || !token) return;
  axios.get(`/api/appointments/${date}`, {
    headers: { Authorization: `Bearer ${token}` }
  })
    .then(res => setAppointments(res.data || []))
    .catch(() => setAppointments([]));
}, [date, token]);
<section className="appointments-section">
  <h2>Appointments</h2>
  <ul>
    {appointments.map(appt => (
      <li key={appt._id}>
        {appt.time} - {appt.details}
      </li>
    ))}
  </ul>
</section>

  return (
    <div className="daily-page">
      <header className="daily-page-header">
        <h1>{formattedDate}</h1>
        <Link to="/calendar">← Back to Calendar</Link>
      </header>

      <main className="daily-page-content">
        <div className={`schedule-section ${isScheduleOpen ? 'open' : ''}`}>
          <button className="schedule-toggle" onClick={toggleSchedule}>
            {isScheduleOpen ? '▼ Schedule' : '► Schedule'}
          </button>
          {isScheduleOpen && (
            <div className="schedule-content">
              <HourlySchedule date={date} />
            </div>
          )}
        </div>

       

        <section className="priorities-section">
          <h2>Top Priorities</h2>
          <TopPriorities date={date} importantEvents={importantEvents} />
        </section>

        <section className="notes-section">
          <NotesSection date={date} />
        </section>

        <section className="entries-section">
          <EntriesSection date={date} />
        </section>
      </main>
    </div>
  );
}

export default DailyPage;
