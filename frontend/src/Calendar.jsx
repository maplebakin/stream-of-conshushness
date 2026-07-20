// frontend/src/Calendar.jsx
import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
  const [searchParams] = useSearchParams();
  const { token } = useContext(AuthContext);
  const headers = useMemo(() => (token ? { Authorization: `Bearer ${token}` } : {}), [token]);
  const tzToday = useMemo(() => todayISOInTZ('America/Toronto'), []);

  // current viewed month
  const requestedDate = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.get('from') || '')
    ? searchParams.get('from')
    : tzToday;
  const [initialYear, initialMonth] = requestedDate.split('-').map(Number);
  const [y, setY] = useState(initialYear);
  const [mIdx, setMIdx] = useState(initialMonth - 1); // 0..11

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
  const [loadingMonth, setLoadingMonth] = useState(false);
  const [calendarError, setCalendarError] = useState('');
  const monthRequestSequenceRef = useRef(0);

  // Modals
  const [showApptModal, setShowApptModal] = useState(false);
  const [showEventModal, setShowEventModal] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState(null);
  const [confirmingAppointmentDeleteId, setConfirmingAppointmentDeleteId] = useState('');
  const [confirmingAppointmentDeleteMessage, setConfirmingAppointmentDeleteMessage] = useState('');
  const [deletingAppointmentId, setDeletingAppointmentId] = useState('');

  const loadMonth = useCallback(async () => {
    const sequence = ++monthRequestSequenceRef.current;
    setLoadingMonth(true);
    setCalendarError('');
    try {
      const { data } = await axios.get(`/api/calendar/${monthParam(y, mIdx)}`, { headers });
      if (sequence !== monthRequestSequenceRef.current) return;
      setDayCounts(data?.days || {});
    } catch (error) {
      if (sequence !== monthRequestSequenceRef.current) return;
      setDayCounts({});
      setCalendarError(error?.response?.data?.error || error?.message || 'Could not load this month.');
    } finally {
      if (sequence === monthRequestSequenceRef.current) setLoadingMonth(false);
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
    if (deletingAppointmentId) return;
    setDeletingAppointmentId(id);
    setCalendarError('');
    try {
      await axios.delete(`/api/appointments/${encodeURIComponent(id)}`, { headers });
      setConfirmingAppointmentDeleteId('');
      setConfirmingAppointmentDeleteMessage('');
      await loadMonth();
      refreshHorizon();
    } catch (error) {
      setCalendarError(error?.response?.data?.error || error?.message || 'Could not delete the appointment.');
    } finally {
      setDeletingAppointmentId('');
    }
  }

  const weekLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const monthName = new Date(y, mIdx, 1).toLocaleString(undefined, { month: 'long' });
  const humanToday = new Date(`${tzToday}T12:00:00Z`).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  return (
    <main className="calendar-page">
      <section className="panel calendar-panel">
        <header className="calendar-header">
          <div className="title">
            <h2>{monthName} {y}</h2>
            <span className="subtitle">Today is {humanToday}</span>
          </div>
          <div className="calendar-nav">
            <button type="button" className="button" onClick={prevMonth} aria-label="Previous month">◀</button>
            <button type="button" className="button" onClick={() => navigate(`/day/${tzToday}`)}>Today</button>
            <button type="button" className="button" onClick={nextMonth} aria-label="Next month">▶</button>
            <div className="calendar-add">
              <button
                type="button"
                className="button"
                onClick={() => setShowAddMenu(open => !open)}
                aria-expanded={showAddMenu}
              >
                + Add
              </button>
              {showAddMenu && (
                <div className="calendar-add__menu" aria-label="Add to calendar">
                  <button type="button" onClick={() => { setShowAddMenu(false); openNewAppointment(); }}>
                    <strong>Appointment</strong>
                    <span>A scheduled time or recurring commitment</span>
                  </button>
                  <button type="button" onClick={() => { setShowAddMenu(false); setShowEventModal(true); }}>
                    <strong>Important date</strong>
                    <span>An all-day event or date to remember</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {loadingMonth && <div className="muted" role="status">Loading calendar…</div>}
        {!loadingMonth && calendarError && (
          <div className="alert error" role="alert">
            {calendarError}{' '}
            <button type="button" className="button chip" onClick={loadMonth}>Retry</button>
          </div>
        )}

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
                aria-label={d
                  ? `Open ${iso}: ${counts.tasks} tasks, ${counts.appointments} appointments, ${counts.events} important events`
                  : 'Empty calendar cell'}
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

      <aside className="panel calendar-horizon-panel" aria-label="Upcoming calendar items">
        <OnTheHorizon
          refreshKey={horizonRefreshKey}
          onEditAppointment={openEditAppointment}
          onDeleteAppointment={deleteAppointment}
          confirmingAppointmentDeleteId={confirmingAppointmentDeleteId}
          confirmingAppointmentDeleteMessage={confirmingAppointmentDeleteMessage}
          deletingAppointmentId={deletingAppointmentId}
          onCancelAppointmentDelete={() => {
            setConfirmingAppointmentDeleteId('');
            setConfirmingAppointmentDeleteMessage('');
          }}
        />
      </aside>

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
