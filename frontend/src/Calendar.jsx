// frontend/src/Calendar.jsx
import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import axios from './api/axiosInstance';
import { AuthContext } from './AuthContext.jsx';
import {
  getAppointmentDeleteConfirmation,
  getStoredAppointmentId,
} from './utils/appointmentIds.js';
import { getCalendarDay } from './api/calendar.js';
import { sourceEntryPath, sourceStateLabel } from './utils/sourceEntryState.js';

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

function isISODate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

function humanDate(value, options = {}) {
  if (!isISODate(value)) return value || '';
  return new Date(`${value}T12:00:00Z`).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    ...options,
  });
}

function timeLabel(item) {
  const start = item?.timeStart || item?.time || '';
  if (!start) return 'All day';
  const [hour, minute = '00'] = String(start).split(':');
  const hourNumber = Number(hour);
  if (!Number.isFinite(hourNumber)) return start;
  const suffix = hourNumber >= 12 ? 'PM' : 'AM';
  const displayHour = hourNumber % 12 || 12;
  const startLabel = `${displayHour}:${minute} ${suffix}`;
  if (!item?.timeEnd) return startLabel;
  const [endHour, endMinute = '00'] = String(item.timeEnd).split(':');
  const endHourNumber = Number(endHour);
  if (!Number.isFinite(endHourNumber)) return startLabel;
  const endSuffix = endHourNumber >= 12 ? 'PM' : 'AM';
  const endLabel = `${endHourNumber % 12 || 12}:${endMinute} ${endSuffix}`;
  return `${startLabel}–${endLabel}`;
}

function provenanceLabel(item) {
  const sourceState = sourceStateLabel(item);
  if (sourceState) return sourceState;
  if (item?.source === 'user-edited') return 'Edited';
  if (item?.source === 'entry-automation' || item?.sourceEntryId || item?.entryId) return 'Automation';
  return 'Manual';
}

export default function Calendar() {
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
  const initialSelectedDate = isISODate(searchParams.get('day'))
    && searchParams.get('day').startsWith(`${initialYear}-${String(initialMonth).padStart(2, '0')}`)
    ? searchParams.get('day')
    : requestedDate;
  const [selectedDate, setSelectedDate] = useState(initialSelectedDate);

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
  const [selectedAgenda, setSelectedAgenda] = useState({ appointments: [], events: [] });
  const [loadingSelectedAgenda, setLoadingSelectedAgenda] = useState(false);
  const [selectedAgendaError, setSelectedAgendaError] = useState('');
  const [selectedAgendaRefreshKey, setSelectedAgendaRefreshKey] = useState(0);

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

  useEffect(() => {
    let cancelled = false;
    if (!selectedDate) return undefined;
    setLoadingSelectedAgenda(true);
    setSelectedAgendaError('');
    getCalendarDay(selectedDate)
      .then((data) => {
        if (!cancelled) setSelectedAgenda({ appointments: data.appointments, events: data.importantEvents });
      })
      .catch((error) => {
        if (!cancelled) {
          setSelectedAgenda({ appointments: [], events: [] });
          setSelectedAgendaError(error?.response?.data?.error || error?.message || 'Could not load this day.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingSelectedAgenda(false);
      });
    return () => { cancelled = true; };
  }, [selectedDate, selectedAgendaRefreshKey]);

  // nav
  function prevMonth() {
    const d = new Date(y, mIdx - 1, 1);
    setY(d.getFullYear());
    setMIdx(d.getMonth());
    setSelectedDate(toISO(d.getFullYear(), d.getMonth(), 1));
  }
  function nextMonth() {
    const d = new Date(y, mIdx + 1, 1);
    setY(d.getFullYear());
    setMIdx(d.getMonth());
    setSelectedDate(toISO(d.getFullYear(), d.getMonth(), 1));
  }

  function goToToday() {
    const [todayYear, todayMonth] = tzToday.split('-').map(Number);
    setY(todayYear);
    setMIdx(todayMonth - 1);
    setSelectedDate(tzToday);
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
      setSelectedAgendaRefreshKey((key) => key + 1);
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
  const selectedAgendaItems = useMemo(() => [
    ...(selectedAgenda.appointments || []).map((item) => ({ ...item, type: 'appointment' })),
    ...(selectedAgenda.events || []).map((item) => ({ ...item, type: 'event' })),
  ].sort((a, b) => {
    const aTime = a.timeStart || a.time || '99:99';
    const bTime = b.timeStart || b.time || '99:99';
    if (aTime !== bTime) return aTime.localeCompare(bTime);
    return String(a.title || '').localeCompare(String(b.title || ''));
  }), [selectedAgenda]);

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
            {(selectedDate !== tzToday || monthParam(y, mIdx) !== tzToday.slice(0, 7)) && (
              <button type="button" className="button" onClick={goToToday}>Today</button>
            )}
            <button type="button" className="button" onClick={nextMonth} aria-label="Next month">▶</button>
            <div className="calendar-add">
              <button
                type="button"
                className="button"
                onClick={() => setShowAddMenu(open => !open)}
                aria-expanded={showAddMenu}
                aria-controls="calendar-add-menu"
              >
                + Add
              </button>
              {showAddMenu && (
                <div id="calendar-add-menu" className="calendar-add__menu" aria-label="Add to calendar">
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
            const isSelectedCell = d && iso === selectedDate;
            const counts = (d && dayCounts[iso]) || { tasks: 0, appointments: 0, events: 0 };
            const visibleTaskDots = Math.min(counts.tasks, 2);
            const indicatorTotal = counts.events + counts.appointments + counts.tasks;
            const visibleIndicatorTotal = (counts.events > 0 ? 1 : 0) + (counts.appointments > 0 ? 1 : 0) + visibleTaskDots;
            const extraIndicatorCount = Math.max(0, indicatorTotal - visibleIndicatorTotal);

            return (
              <button
                key={i}
                className={`calendar-cell ${d ? '' : 'empty'} ${isTodayCell ? 'today' : ''} ${isSelectedCell ? 'selected' : ''}`}
                disabled={!d}
                onClick={() => d && setSelectedDate(iso)}
                aria-pressed={d ? isSelectedCell : undefined}
                aria-label={d
                  ? `Select ${humanDate(iso, { year: 'numeric' })}: ${counts.tasks} tasks, ${counts.appointments} appointments, ${counts.events} important events`
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
                        {Array.from({ length: visibleTaskDots }).map((_, i) => (
                          <span key={`t${i}`} className="calendar-dot task" />
                        ))}
                        {counts.appointments > 0 && <span className="calendar-dot appt" title={`${counts.appointments} appointment(s)`} />}
                        {extraIndicatorCount > 0 && <span className="calendar-more">+{extraIndicatorCount}</span>}
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

        <section className="calendar-selected-day" aria-labelledby="calendar-selected-day-title">
          <header className="calendar-selected-day__header">
            <div>
              <p className="calendar-selected-day__eyebrow">Selected day</p>
              <h3 id="calendar-selected-day-title">{humanDate(selectedDate)}</h3>
            </div>
            <Link className="button chip" to={`/day/${selectedDate}`}>Open full day</Link>
          </header>

          {loadingSelectedAgenda && <p className="muted" role="status">Loading day…</p>}
          {!loadingSelectedAgenda && selectedAgendaError && <p className="alert error" role="alert">{selectedAgendaError}</p>}
          {!loadingSelectedAgenda && !selectedAgendaError && selectedAgendaItems.length === 0 && (
            <p className="muted">Nothing scheduled for this day.</p>
          )}
          {!loadingSelectedAgenda && !selectedAgendaError && selectedAgendaItems.length > 0 && (
            <ul className="calendar-selected-day__list">
              {selectedAgendaItems.map((item) => {
                const sourcePath = sourceEntryPath(item);
                const appointmentDeleteId = item.type === 'appointment' ? getStoredAppointmentId(item) : '';
                const confirmingDelete = appointmentDeleteId && confirmingAppointmentDeleteId === appointmentDeleteId;
                const deleting = appointmentDeleteId && deletingAppointmentId === appointmentDeleteId;
                return (
                  <li key={`${item.type}-${item._id || item.id}-${item.date}`} className="calendar-selected-day__item">
                    <div className="calendar-selected-day__item-copy">
                      <strong>{item.type === 'appointment' ? '🗓️' : '⭐'} {item.title || '(untitled)'}</strong>
                      <span>{timeLabel(item)} · {provenanceLabel(item)}</span>
                    </div>
                    <div className="calendar-selected-day__item-actions">
                      {sourcePath && <Link className="button chip" to={sourcePath}>View source</Link>}
                      {item.type === 'appointment' && (
                        <>
                          <button type="button" className="button chip" onClick={() => openEditAppointment(item)}>Edit</button>
                          <button
                            type="button"
                            className="button chip"
                            onClick={() => deleteAppointment(item)}
                            disabled={Boolean(deletingAppointmentId)}
                          >
                            {deleting ? 'Deleting…' : confirmingDelete ? 'Confirm delete' : 'Delete'}
                          </button>
                          {confirmingDelete && (
                            <button
                              type="button"
                              className="button chip"
                              onClick={() => {
                                setConfirmingAppointmentDeleteId('');
                                setConfirmingAppointmentDeleteMessage('');
                              }}
                              disabled={Boolean(deletingAppointmentId)}
                            >
                              Cancel
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
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
          defaultDate={selectedDate}
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
            setSelectedAgendaRefreshKey((key) => key + 1);
          }}
        />
      )}
      {showEventModal && (
        <ImportantEventModal
          defaultDate={selectedDate}
          onClose={() => setShowEventModal(false)}
          onSaved={() => {
            setShowEventModal(false);
            refreshHorizon();
            loadMonth();
            setSelectedAgendaRefreshKey((key) => key + 1);
          }}
        />
      )}
    </main>
  );
}
