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

function todayISOInToronto() {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric', month: '2-digit', day: '2-digit'
  });
  const p = fmt.formatToParts(new Date());
  return `${p.find(x=>x.type==='year').value}-${p.find(x=>x.type==='month').value}-${p.find(x=>x.type==='day').value}`;
}
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

  const todayISO = useMemo(() => todayISOInToronto(), []);
  const [dateISO, setDateISO] = useState(routeDate || todayISO);

  // cause TaskList to refetch (we pass as key)
  const [taskListKey, setTaskListKey] = useState(0);

  // modals
  const [showEntryModal, setShowEntryModal] = useState(false);
  const [showApptModal, setShowApptModal] = useState(false);

  // user toggle: auto-carry overdue tasks when landing on Today
  const [autoCarry, setAutoCarry] = useState(() => localStorage.getItem('auto_cf') === '1');

  useEffect(() => {
    if (!routeDate) {
      navigate(`/day/${dateISO}`, { replace: true });
    } else {
      setDateISO(routeDate);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeDate]);

  // optional: run carry-forward automatically on Today once per calendar day
  useEffect(() => {
    if (!autoCarry) return;
    if (dateISO !== todayISO) return;
    const last = localStorage.getItem('cf_last_run');
    if (last === todayISO) return;

    axios.post('/api/tasks/carry-forward', null, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    })
    .then(() => {
      localStorage.setItem('cf_last_run', todayISO);
      setTaskListKey(k => k + 1);
    })
    .catch(() => {});
  }, [autoCarry, dateISO, todayISO, token]);

  const go = (offsetDays) => {
    const d = new Date(dateISO + 'T00:00:00');
    d.setDate(d.getDate() + offsetDays);
    navigate(`/day/${toISO(d)}`);
  };

  // manual carry-forward button (server-side bulk)
  async function carryForwardNow() {
    try {
      await axios.post('/api/tasks/carry-forward', null, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      setTaskListKey(k => k + 1);
    } catch (e) {
      console.error('carry-forward failed', e);
    }
  }

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

        <div className="daily-actions" style={{ gap: 8, display: 'flex', alignItems: 'center' }}>
          {dateISO === todayISO && (
            <>
              <button
                className="button chip"
                onClick={() => {
                  const next = !autoCarry;
                  setAutoCarry(next);
                  localStorage.setItem('auto_cf', next ? '1' : '0');
                }}
                title="Automatically carry forward overdue tasks on Today"
              >
                Auto-carry: {autoCarry ? 'On' : 'Off'}
              </button>
              <button className="button chip" onClick={carryForwardNow}>
                Carry forward now
              </button>
            </>
          )}
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
            {/* TaskList fetches its own data using the date prop */}
            <TaskList key={taskListKey} date={dateISO} header="Today’s Tasks" />
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
          defaultDate={dateISO}         /* make entries land on the viewed day */
          onClose={() => setShowEntryModal(false)}
          onSaved={() => {
            // ripples + tasks may have changed; remount TaskList
            setTaskListKey(k => k + 1);
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
