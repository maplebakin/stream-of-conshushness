// src/Calendar.jsx
import React, { useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from './api/axiosInstance';
import { AuthContext } from './AuthContext.jsx';
import AppointmentModal from './AppointmentModal.jsx'; // ✅ reuse
import './Calendar.css';
import ImportantEventModal from './ImportantEventModal.jsx';

// Toronto "today" in YYYY-MM-DD (safe, no UTC flip)
function todayISOInTZ(timeZone = 'America/Toronto') {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const [{ value: y }, , { value: m }, , { value: d }] = fmt.formatToParts(new Date());
  return `${y}-${m}-${d}`;
}
function toISO(y, mIdx, d) {
  const mm = String(mIdx + 1).padStart(2, '0');
  const dd = String(d).padStart(2, '0');
  return `${y}-${mm}-${dd}`;
}
function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}
function monthParam(y, mIdx) {
  return `${y}-${String(mIdx + 1).padStart(2, '0')}`; // YYYY-MM
}
function countdownLabel(days) {
  if (days < 0) return null;
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `In ${days} days`;
}

/** Minimal inline modal for important events (title + date) */
function QuickEventModal({ defaultDate, onClose, onSaved }) {
  const { token } = useContext(AuthContext);
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(defaultDate);
  const [saving, setSaving] = useState(false);

  async function save() {
    const t = title.trim();
    if (!t) return;
    setSaving(true);
    try {
      // Adjust endpoint/shape to your API if needed
      await axios.post('/api/events', { title: t, date, important: true }, { headers });
      onSaved?.();
      onClose?.();
    } catch (e) {
      console.error('Failed to create event', e);
      alert('Could not create event');
    } finally {
      setSaving(false);
    }
  }
  function onKey(e) {
    if (e.key === 'Enter') { e.preventDefault(); save(); }
    if (e.key === 'Escape') { e.preventDefault(); onClose?.(); }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <h3 className="font-thread text-vein" style={{ marginTop: 0 }}>Add important event</h3>
        <div style={{ display:'grid', gap: 8 }}>
          <input
            className="input"
            autoFocus
            placeholder="Event title…"
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={onKey}
          />
          <input
            className="input"
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
          />
          <div style={{ display:'flex', gap: 8, justifyContent:'flex-end' }}>
            <button className="button chip" onClick={onClose} disabled={saving}>Cancel</button>
            <button className="button chip" onClick={save} disabled={saving || !title.trim()}>Add</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Calendar() {
  const navigate = useNavigate();
  const { token } = useContext(AuthContext);
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const tzToday = useMemo(() => todayISOInTZ('America/Toronto'), []);

  // current viewed month
  const now = new Date();
  const [y, setY] = useState(now.getFullYear());
  const [mIdx, setMIdx] = useState(now.getMonth()); // 0..11

  // month grid
  const firstWeekday = new Date(y, mIdx, 1).getDay(); // 0..6 Sun..Sat
  const totalDays = daysInMonth(y, mIdx);
  const cells = useMemo(() => {
    const arr = [];
    for (let i = 0; i < firstWeekday; i++) arr.push(null);
    for (let d = 1; d <= totalDays; d++) arr.push(d);
    while (arr.length % 7 !== 0) arr.push(null);
    return arr;
  }, [firstWeekday, totalDays]);

  // per-day counts for badges
  const [dayCounts, setDayCounts] = useState({});
  // sidebar upcoming
  const [upcoming, setUpcoming] = useState({ appointments: [], events: [], today: tzToday });

  // NEW: modal state
  const [showApptModal, setShowApptModal] = useState(false);
  const [showEventModal, setShowEventModal] = useState(false);

  async function loadMonth() {
    const { data } = await axios.get(`/api/calendar/${monthParam(y, mIdx)}`, { headers });
    setDayCounts(data?.days || {});
  }
  async function loadUpcoming() {
    try {
      const { data } = await axios.get(`/api/calendar/upcoming/list?from=${tzToday}`, { headers });
      setUpcoming(data || { appointments: [], events: [], today: tzToday });
    } catch {
      // if the upcoming route isn't mounted yet, fail quietly
      setUpcoming({ appointments: [], events: [], today: tzToday });
    }
  }

  useEffect(() => { loadMonth(); /* eslint-disable-next-line */ }, [y, mIdx]);
  useEffect(() => { loadUpcoming(); /* eslint-disable-next-line */ }, []);

  // nav
  function prevMonth() {
    const d = new Date(y, mIdx - 1, 1);
    setY(d.getFullYear());
    setMIdx(d.getMonth());
  }
  function nextMonth() {
    const d = new Date(y, mIdx + 1, 1);
    setY(d.getFullYear());
    setMIdx(d.getMonth());
  }

  const weekLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const monthName = new Date(y, mIdx, 1).toLocaleString(undefined, { month: 'long' });

  return (
    <main className="calendar-page" style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 16 }}>
      {/* Left sidebar — upcoming feed */}
      <aside className="panel" style={{ position: 'sticky', top: 12, alignSelf: 'start', padding: 12 }}>
        <h3 className="font-thread text-vein" style={{ marginBottom: 8 }}>Upcoming</h3>

        <section style={{ marginBottom: 16 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: 6 }}>
            <h4 className="muted" style={{ margin: 0 }}>Important Events ⭐</h4>
            <button
              className="button chip"
              type="button"
              onClick={() => setShowEventModal(true)}
              title="Add important event"
            >
              + Add
            </button>
          </div>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
            {upcoming.events.filter(e => countdownLabel(e.daysUntil)).length === 0 ? (
              <li className="muted">Nothing soon.</li>
            ) : (
              upcoming.events.map(ev => {
                const label = countdownLabel(ev.daysUntil);
                if (!label) return null;
                return (
                  <li key={ev.id} className="task" style={{ background:'var(--card,#fff)', borderRadius: 12, padding:'8px 10px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <span>⭐ {ev.title}</span>
                    <span className="muted" title={ev.date}>{label}</span>
                  </li>
                );
              })
            )}
          </ul>
        </section>

        <section>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: 6 }}>
            <h4 className="muted" style={{ margin: 0 }}>Appointments 🗓️</h4>
            <button
              className="button chip"
              type="button"
              onClick={() => setShowApptModal(true)}
              title="Add appointment"
            >
              + Add
            </button>
          </div>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
            {upcoming.appointments.filter(a => countdownLabel(a.daysUntil)).length === 0 ? (
              <li className="muted">Nothing scheduled.</li>
            ) : (
              upcoming.appointments.map(ap => {
                const label = countdownLabel(ap.daysUntil);
                if (!label) return null;
                return (
                  <li key={ap.id} className="task" style={{ background:'var(--card,#fff)', borderRadius: 12, padding:'8px 10px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <span>🗓️ {ap.title}</span>
                    <span className="muted" title={ap.date}>{label}</span>
                  </li>
                );
              })
            )}
          </ul>
        </section>
      </aside>

      {/* Main month grid */}
      <section className="panel calendar-panel">
        <header className="calendar-header" style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: 8 }}>
          <div className="title">
            <h2>{monthName} {y}</h2>
            <span className="subtitle">{tzToday}</span>
          </div>
          <div style={{ display:'flex', gap: 8 }}>
            <button className="button" onClick={prevMonth}>◀</button>
            <button className="button" onClick={() => navigate(`/day/${tzToday}`)}>Today</button>
            <button className="button" onClick={nextMonth}>▶</button>
          </div>
        </header>

        <div className="calendar-grid">
          {weekLabels.map((w) => (
            <div key={w} className="calendar-weekday">{w}</div>
          ))}

          {cells.map((d, i) => {
            const iso = d ? toISO(y, mIdx, d) : '';
            const isTodayCell = d && iso === tzToday;
            const counts = (d && dayCounts[iso]) || { tasks: 0, appointments: 0, events: 0 };

            return (
              <button
                key={i}
                className={`calendar-cell ${d ? '' : 'empty'} ${isTodayCell ? 'today' : ''}`}
                disabled={!d}
                onClick={() => d && navigate(`/day/${iso}`)}
                aria-label={d ? `Open ${iso}` : 'Empty'}
                title={d ? iso : ''}
              >
                {d ? (
                  <>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                      <span className="calendar-daynum">{d}</span>
                      <div className="badges" style={{ display:'flex', gap:6 }}>
                        {counts.events > 0 && <span className="pill" title={`${counts.events} important event(s)`}>⭐ {counts.events}</span>}
                        {counts.appointments > 0 && <span className="pill" title={`${counts.appointments} appointment(s)`}>🗓️ {counts.appointments}</span>}
                        {counts.tasks > 0 && <span className="pill" title={`${counts.tasks} task(s)`}>● {counts.tasks}</span>}
                      </div>
                    </div>

                    {/* Colored dots row */}
                    {d && (
                      <div className="calendar-dots">
                        {counts.events > 0 && <span className="calendar-dot event" title={`${counts.events} important event(s)`} />}
                        {Array.from({ length: Math.min(counts.tasks, 3) }).map((_, i) => (
                          <span key={`t${i}`} className="calendar-dot task" />
                        ))}
                        {counts.appointments > 0 && <span className="calendar-dot appt" title={`${counts.appointments} appointment(s)`} />}
                        {counts.tasks > 0 && <span className="calendar-dot task" title={`${counts.tasks} task(s)`} />}
                      </div>
                    )}
                  </>
                ) : null}
              </button>
            );
          })}
        </div>

        <div className="calendar-legend">
          <span className="legend-item"><span className="legend-swatch event" />⭐ events</span>
          <span className="legend-item"><span className="legend-swatch appt" />🗓️ appointments</span>
          <span className="legend-item"><span className="legend-swatch task" />● tasks</span>
        </div>
      </section>

      {/* Modals */}
     {showApptModal && (
  <AppointmentModal
    date={tzToday}
    onClose={() => setShowApptModal(false)}
    onSaved={() => { setShowApptModal(false); loadUpcoming(); loadMonth(); }}
  />
)}
{showEventModal && (
  <ImportantEventModal
    date={tzToday}
    onClose={() => setShowEventModal(false)}
    onSaved={() => { setShowEventModal(false); loadUpcoming(); loadMonth(); }}
  />
)}

    </main>
  );
}
