import { useParams, Link } from 'react-router-dom';
import './dailypage.css';
import HourlySchedule from './HourlySchedule';
import React, { useState, useEffect, useContext } from 'react';
import TopPriorities from './TopPriorities';
import TaskList from './TaskList.jsx';
import NotesSection from './NotesSection';
import EntriesSection from './EntriesSection';
import axios from './api/axiosInstance';
import { AuthContext } from './AuthContext.jsx';
import DailyRipples from './DailyRipples';

function DailyPage() {
  const { date } = useParams();
  const { token } = useContext(AuthContext);
  const [importantEvents, setImportantEvents] = useState([]);
  const [appointments, setAppointments] = useState([]);
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

  const toggleSchedule = () => setIsScheduleOpen((prev) => !prev);

  // Fetch important events
  useEffect(() => {
    if (!date || !token) return;

    axios
      .get(`/api/important-events/${date.slice(0, 7)}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => {
        const filtered = (res.data || []).filter((ev) => ev.date === date);
        setImportantEvents(filtered);
      })
      .catch(() => setImportantEvents([]));
  }, [date, token]);

  // Fetch appointments for the day
  useEffect(() => {
    if (!date || !token) return;
    setLoading(true);
    axios
      .get(`/api/appointments/${date}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => setAppointments(res.data || []))
      .catch(() => setAppointments([]))
      .finally(() => setLoading(false));
  }, [date, token]);

  const [yyyy, mm, dd] = date.split('-');
  const formattedDate = new Date(Number(yyyy), Number(mm) - 1, Number(dd)).toLocaleDateString(
    'en-US',
    {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }
  );

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

        {/* Appointments list for the day */}
        <section className="appointments-section">
          <h2>Appointments</h2>
          {loading ? (
            <div>Loading...</div>
          ) : appointments.length === 0 ? (
            <div>No appointments for today.</div>
          ) : (
            <ul>
              {appointments.map((appt) => (
                <li key={appt._id}>
                  {appt.time ? <strong>{appt.time}</strong> : null}
                  {appt.time ? " — " : ""}
                  {appt.details}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Ripples section — show ONCE! */}
        <section className="ripples-section">
          <h2>🌊 Ripples from Today's Entry</h2>
          <DailyRipples date={date} />
        </section>

        <section className="todo-section">
          <TaskList selectedDate={date} />
        </section>

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
