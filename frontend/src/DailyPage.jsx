// src/DailyPage.jsx
import React, { useEffect, useMemo, useState, useContext } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from './api/axiosInstance';
import { AuthContext } from './AuthContext.jsx';
import EntryModal from './EntryModal.jsx';
import TaskList from './TaskList.jsx';
import DailyRipples from './DailyRipples.jsx';
import AppointmentModal from './AppointmentModal.jsx';
import { toDisplayDate } from './utils/date.js';
import './Main.css';
import './dailypage.css';

function toISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function DailyPage() {
  const { date: routeDate } = useParams();
  const navigate = useNavigate();
  const { token } = useContext(AuthContext);

  const todayISO = useMemo(() => toISO(new Date()), []);
  const [dateISO, setDateISO] = useState(routeDate || todayISO);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showEntryModal, setShowEntryModal] = useState(false);
  const [showApptModal, setShowApptModal] = useState(false);

  useEffect(() => {
    if (!routeDate) {
      navigate(`/day/${dateISO}`, { replace: true });
    } else {
      setDateISO(routeDate);
    }
  }, [routeDate]);

  useEffect(() => {
    if (!dateISO) return;
    setLoading(true);
    axios
      .get(`/api/tasks?date=${dateISO}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => setTasks(res.data || []))
      .catch(err => console.error('Failed to load tasks for day:', err))
      .finally(() => setLoading(false));
  }, [dateISO, token]);

  const go = (offsetDays) => {
    const d = new Date(dateISO + 'T00:00:00');
    d.setDate(d.getDate() + offsetDays);
    navigate(`/day/${toISO(d)}`);
  };

  return (
    <main className="daily-page">
      <header className="daily-header">
        <div className="centered-header">
          <button className="button" onClick={() => go(-1)} aria-label="Previous day">◀</button>
          <h2 className="font-echo text-plum text-2xl">{toDisplayDate(dateISO)}</h2>
          <button className="button" onClick={() => go(1)} aria-label="Next day">▶</button>

          {dateISO !== todayISO && (
            <button
              className="button today-btn"
              onClick={() => navigate(`/day/${todayISO}`)}
              title="Jump to today"
            >
              Today
            </button>
          )}

          <span className="daily-date font-glow text-vein" title="ISO date">{dateISO}</span>
        </div>

        <div className="daily-actions">
          <button className="button bg-lantern text-ink rounded-button px-4 py-2 font-thread shadow-soft hover:bg-plum hover:text-mist transition-all" onClick={() => setShowEntryModal(true)}>
            + New Entry
          </button>
          <button className="button bg-spool text-ink rounded-button px-4 py-2 font-thread shadow-soft hover:bg-plum hover:text-mist transition-all" onClick={() => setShowApptModal(true)}>
            + Add appointment
          </button>
        </div>
      </header>

      <section className="daily-layout">
        <div className="daily-main">
          <div className="panel">
            {loading ? <div className="text-vein font-glow">Loading tasks…</div> : (
              <TaskList tasks={tasks} selectedDate={dateISO} />
            )}
          </div>

          <div className="panel">
            <DailyRipples date={dateISO} />
          </div>
        </div>

        <aside className="daily-side">
          <div className="panel">
            <h3 className="font-thread text-vein">Appointments & Events</h3>
            <p className="muted font-glow">Appointments you add show here.</p>
          </div>
          <div className="panel">
            <h3 className="font-thread text-vein">Habits</h3>
            <p className="muted font-glow">Coming in Phase 4.</p>
          </div>
          <div className="panel">
            <h3 className="font-thread text-vein">Hourly Schedule</h3>
            <p className="muted font-glow">Collapsible block coming in Phase 5.</p>
          </div>
        </aside>
      </section>

      {showEntryModal && (
        <EntryModal
          onClose={() => setShowEntryModal(false)}
          defaultDate={dateISO}
          onSaved={() => {
            axios
              .get(`/api/tasks?date=${dateISO}`, { headers: { Authorization: `Bearer ${token}` } })
              .then(res => setTasks(res.data || []))
              .catch(() => {});
          }}
        />
      )}

      {showApptModal && (
        <AppointmentModal
          date={dateISO}
          onClose={() => setShowApptModal(false)}
        />
      )}
    </main>
  );
}
