import { useParams, Link } from 'react-router-dom';
import './dailypage.css';
import HourlySchedule from './HourlySchedule';
import React, { useState, useEffect } from 'react';
import TopPriorities from './TopPriorities';
import ToDoBox from './ToDoBox';
import NotesSection from './NotesSection';
import EntriesSection from './EntriesSection';

function DailyPage() {
  const { date } = useParams();
  const [seedAppointments, setSeedAppointments] = useState({});
    const [importantEvents, setImportantEvents] = useState([]);

  useEffect(() => {
    if (!date) return;

    fetch(`/api/appointments/${date}`)
      .then(res => res.json())
      .then(data => {
        setSeedAppointments(data || {});
      })
      .catch(err => {
        console.error('Error fetching appointments:', err);
        setSeedAppointments({});
      });
  }, [date]);
useEffect(() => {
  if (!date) return;
  fetch(`/api/important-events/date/${date}`)
    .then(res => res.json())
    .then(data => setImportantEvents(data || []))
    .catch(() => setImportantEvents([]));
}, [date]);

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

  return (
    <div className="daily-page">
      <header className="daily-page-header">
        <h1>{formattedDate}</h1>
        <Link to="/calendar">← Back to Calendar</Link>
      </header>

      <main className="daily-page-content">
        <section className="schedule-section">
          <HourlySchedule date={date} seedAppointments={seedAppointments} />
        </section>

        <section className="todo-section">
          <h2>To-Do List</h2>
          <ToDoBox date={date} />
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
