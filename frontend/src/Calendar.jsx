// frontend/src/Calendar.jsx
import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from './api/axiosInstance';
import { AuthContext } from './AuthContext.jsx';
import {
  getAppointmentDeleteConfirmation,
  getStoredAppointmentId,
} from './utils/appointmentIds.js';

import AppointmentModal from './AppointmentModal.jsx';
import ImportantEventModal from './adapters/ImportantEventModal.default.jsx';
import OnTheHorizon from './components/OnTheHorizon.jsx';
import { todayISOInTZ } from './utils/date.js';

import './Calendar.css';
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
export default function Calendar() {
  const navigate = useNavigate();
  const { token } = useContext(AuthContext);
  const headers = useMemo(() => (token ? { Authorization: `Bearer ${token}` } : {}), [token]);
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
  const [horizonRefreshKey, setHorizonRefreshKey] = useState(0);

  // Modals
  const [showApptModal, setShowApptModal] = useState(false);
  const [showEventModal, setShowEventModal] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState(null);
  const [confirmingAppointmentDeleteId, setConfirmingAppointmentDeleteId] = useState('');
  const [confirmingAppointmentDeleteMessage, setConfirmingAppointmentDeleteMessage] = useState('');

  const loadMonth = useCallback(async () => {
    // Assumes you’ve got an aggregator route; if not, this will just noop the badges.
    try {
      const { data } = await axios.get(`/api/calendar/${monthParam(y, mIdx)}`, { headers });
      setDayCounts(data?.days || {});
    } catch {
      setDayCounts({});
    }
  }, [headers, y, mIdx]);

  const refreshHorizon = useCallback(() => {
    setHorizonRefreshKey((key) => key + 1);
  }, []);

  useEffect(() => { loadMonth(); }, [loadMonth]);

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

  function openNewAppointment() {
    setEditingAppointment(null);
    setConfirmingAppointmentDeleteId('');
    setConfirmingAppointmentDeleteMessage('');
    setShowApptModal(true);
  }

  function openEditAppointment(appointment) {
    setEditingAppointment(appointment);
    setConfirmingAppointmentDeleteId('');
    setConfirmingAppointmentDeleteMessage('');
    setShowApptModal(true);
  }

  async function deleteAppointment(appointment) {
    const id = getStoredAppointmentId(appointment);
    if (!id) return;
    const confirmationMessage = getAppointmentDeleteConfirmation(appointment);
    if (confirmingAppointmentDeleteId !== id) {
      setConfirmingAppointmentDeleteId(id);
      setConfirmingAppointmentDeleteMessage(confirmationMessage);
      return;
    }
    await axios.delete(`/api/appointments/${encodeURIComponent(id)}`, { headers });
    setConfirmingAppointmentDeleteId('');
    setConfirmingAppointmentDeleteMessage('');
    await loadMonth();
    refreshHorizon();
  }

  const weekLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const monthName = new Date(y, mIdx, 1).toLocaleString(undefined, { month: 'long' });

  return (
    <main className="calendar-page">
      {/* Left sidebar — upcoming feed */}
      <aside className="panel calendar-horizon-panel">
        <OnTheHorizon
          refreshKey={horizonRefreshKey}
          onAddAppointment={openNewAppointment}
          onAddEvent={() => setShowEventModal(true)}
          onEditAppointment={openEditAppointment}
          onDeleteAppointment={deleteAppointment}
          confirmingAppointmentDeleteId={confirmingAppointmentDeleteId}
          confirmingAppointmentDeleteMessage={confirmingAppointmentDeleteMessage}
          onCancelAppointmentDelete={() => {
            setConfirmingAppointmentDeleteId('');
            setConfirmingAppointmentDeleteMessage('');
          }}
        />
      </aside>

      {/* Main month grid */}
      <section className="panel calendar-panel">
        <header className="calendar-header">
          <div className="title">
            <h2>{monthName} {y}</h2>
            <span className="subtitle">{tzToday}</span>
          </div>
          <div className="calendar-nav">
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
                    <div className="calendar-cell-top">
                      <span className="calendar-daynum">{d}</span>
                      <div className="badges">
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

      {/* Modals — pass defaultDate to match adapters */}
      {showApptModal && (
        <AppointmentModal
          defaultDate={tzToday}
          initialAppointment={editingAppointment}
          onClose={() => {
            setShowApptModal(false);
            setEditingAppointment(null);
          }}
          onSaved={() => {
            setShowApptModal(false);
            setEditingAppointment(null);
            refreshHorizon();
            loadMonth();
          }}
        />
      )}
      {showEventModal && (
        <ImportantEventModal
          defaultDate={tzToday}
          onClose={() => setShowEventModal(false)}
          onSaved={() => { setShowEventModal(false); refreshHorizon(); loadMonth(); }}
        />
      )}
    </main>
  );
}
