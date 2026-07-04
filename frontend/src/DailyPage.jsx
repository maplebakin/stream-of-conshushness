// frontend/src/DailyPage.jsx
import React, { useEffect, useMemo, useState, useContext, useCallback } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import axios from './api/axiosInstance';
import { AuthContext } from './AuthContext.jsx';
import { listSuggestedGatherItems } from './api/suggestedGatherItems.js';
import { listSuggestedInterests } from './api/suggestedInterests.js';

import TaskList from './TaskList.jsx';
import SuggestedTasksInbox from './SuggestedTasksInbox.jsx';
import EntryQuickAssign from './adapters/EntryQuickAssign.default.jsx';
import AnalyzeEntryButton from './adapters/AnalyzeEntryButton.default.jsx';
import EntryModal from './EntryModal.jsx';
import AppointmentModal from './AppointmentModal.jsx';
import {
  getAppointmentDeleteConfirmation,
  getAppointmentDetailParts,
  getStoredAppointmentId,
} from './utils/appointmentIds.js';

import DailyRipples from './DailyRipples.jsx';
import HourlySchedule from './HourlySchedule.jsx';
import NotesSection from './NotesSection.jsx';

import { renderSafe } from './utils/safeRender.js';
import { toDisplayDate, todayISOInToronto, formatHM as formatHMUtil } from './utils/date.js';
import { toDisplay } from './utils/display.js';
import { isClustered } from './utils/isClustered.js';

import './Main.css';
import './dailypage.css';

/* ---------- Toronto-safe date helpers ---------- */
function toISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
const formatHM = formatHMUtil;

/* ---------- entry helpers ---------- */
function isoFromDateLike(val) {
  if (!val) return '';
  const d = new Date(val);
  return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}
function entryDateISO(en) {
  return en?.date || en?.dateISO || isoFromDateLike(en?.createdAt) || '';
}
function stripHtml(html) {
  if (typeof html !== 'string') return '';
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .trim();
}
function entryHasMeaningfulText(en) {
  const t = typeof en?.text === 'string' ? en.text : '';
  const c = typeof en?.content === 'string' ? en.content : '';
  const plain = (t || stripHtml(c)).replace(/\s+/g, ' ').trim();
  return plain.length > 0;
}

function eventAliasKey(item) {
  const id = item?._id || item?.id;
  if (id) return String(id);
  return `${item?.date || ''}|${item?.title || ''}`;
}

/* ===================================================== */
export default function DailyPage() {
  const { date: routeDate } = useParams();
  const navigate = useNavigate();
  const { token } = useContext(AuthContext);

  const todayISO = useMemo(() => todayISOInToronto(), []);
  const [dateISO, setDateISO] = useState(routeDate || todayISO);

  const [taskListKey, setTaskListKey] = useState(0);
  const [rippleListKey, setRippleListKey] = useState(0);
  const [suggestionsKey, setSuggestionsKey] = useState(0);
  const [showEntryModal, setShowEntryModal] = useState(false);
  const [showApptModal, setShowApptModal] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState(null);
  const [autoCarry, setAutoCarry] = useState(() => localStorage.getItem('auto_cf') === '1');
  const [showSchedule, setShowSchedule] = useState(
    () => localStorage.getItem('show_sched') !== '0'
  );

  const [entries, setEntries] = useState([]);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [unassignedOnly, setUnassignedOnly] = useState(
    () => localStorage.getItem('entries_unassigned_only') === '1'
  );

  const [appointments, setAppointments] = useState([]);
  const [events,       setEvents]       = useState([]);
  const [important,    setImportant]    = useState([]);
  const [loadingAgenda, setLoadingAgenda] = useState(false);
  const [otherSuggestionCounts, setOtherSuggestionCounts] = useState({ gather: 0, interests: 0 });
  const [loadingOtherSuggestions, setLoadingOtherSuggestions] = useState(false);
  const [otherSuggestionsError, setOtherSuggestionsError] = useState('');

  useEffect(() => {
    if (!routeDate) {
      navigate(`/day/${dateISO}`, { replace: true });
    } else {
      setDateISO(routeDate);
    }
  }, [routeDate]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!autoCarry) return;
    if (dateISO !== todayISO) return;
    const last = localStorage.getItem('cf_last_run');
    if (last === todayISO) return;

    axios.post('/api/tasks/carry-forward')
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

  async function carryForwardNow() {
    try {
      await axios.post('/api/tasks/carry-forward');
      setTaskListKey(k => k + 1);
    } catch (e) {
      console.error('carry-forward failed', e);
    }
  }

  const loadEntries = useCallback(async () => {
    if (!token || !dateISO) return;
    setLoadingEntries(true);
    try {
      const res = await axios.get(`/api/entries/by-date/${dateISO}`);
      let list = Array.isArray(res.data) ? res.data : [];
      list = list.filter(e => entryDateISO(e) === dateISO);
      list = list.filter(entryHasMeaningfulText);
      if (unassignedOnly) list = list.filter(entry => !isClustered(entry));
      setEntries(list);
    } catch (err) {
      console.error('loadEntries error', err?.message || err);
      setEntries([]);
    } finally {
      setLoadingEntries(false);
    }
  }, [token, dateISO, unassignedOnly]);

  useEffect(() => { loadEntries(); }, [loadEntries]);

  const loadOtherSuggestionCounts = useCallback(async () => {
    if (!token || !dateISO) return;
    setLoadingOtherSuggestions(true);
    setOtherSuggestionsError('');
    try {
      const [gatherSuggestions, interestSuggestions] = await Promise.all([
        listSuggestedGatherItems({ date: dateISO }),
        listSuggestedInterests({ date: dateISO }),
      ]);
      setOtherSuggestionCounts({
        gather: gatherSuggestions.length,
        interests: interestSuggestions.length,
      });
    } catch (err) {
      console.error('load suggestion counts error', err?.response?.data || err?.message || err);
      setOtherSuggestionCounts({ gather: 0, interests: 0 });
      setOtherSuggestionsError('Could not load suggestion counts.');
    } finally {
      setLoadingOtherSuggestions(false);
    }
  }, [token, dateISO]);

  useEffect(() => { loadOtherSuggestionCounts(); }, [loadOtherSuggestionCounts]);

  function handleEntryUpdated(updated) {
    const stillToday = entryDateISO(updated) === dateISO && entryHasMeaningfulText(updated);
    setEntries(prev => {
      const next = prev.map(e => e._id === updated._id ? updated : e);
      if (!stillToday) {
        return next.filter(e => e._id !== updated._id);
      }
      if (unassignedOnly && isClustered(updated)) {
        return next.filter(e => e._id !== updated._id);
      }
      return next;
    });
  }
  function handleTaskCreated() {
    setTaskListKey(k => k + 1);
  }
  function refreshAutomationPanels() {
    setTaskListKey(k => k + 1);
    setRippleListKey(k => k + 1);
    setSuggestionsKey(k => k + 1);
    loadOtherSuggestionCounts();
  }

  const loadAgenda = useCallback(async () => {
    if (!token || !dateISO) return;
    setLoadingAgenda(true);
    try {
      const { data } = await axios.get(`/api/calendar/day/${dateISO}`);
      setAppointments(Array.isArray(data.appointments) ? data.appointments : []);
      setEvents(Array.isArray(data.events) ? data.events : []);
      setImportant(Array.isArray(data.importantEvents) ? data.importantEvents : []);
    } catch (err) {
      console.error('loadAgenda error', err?.message || err);
      setAppointments([]); setEvents([]); setImportant([]);
    } finally {
      setLoadingAgenda(false);
    }
  }, [token, dateISO]);

  useEffect(() => { loadAgenda(); }, [loadAgenda]);

  const timeline = useMemo(() => {
    const appts = (appointments || []).map(a => ({
      ...a,
      _id: a._id,
      type: 'appointment',
      title: a.title || '(untitled)',
      date: a.date,
      time: a.timeStart || null,
      timeEnd: a.timeEnd || null,
      location: a.location || '',
      details: a.details || '',
    }));
    const importantKeys = new Set((important || []).map(eventAliasKey));
    const evs = (events || [])
      .filter(e => !importantKeys.has(eventAliasKey(e)))
      .map(e => ({
        _id: e._id,
        type: 'event',
        title: e.title || '(untitled)',
        date: e.date,
        time: null,
        pinned: !!e.pinned,
      }));
    const imps = (important || []).map(e => ({
      _id: e._id,
      type: 'important',
      title: e.title || '(untitled)',
      date: e.date,
      time: null,
      note: e.details || e.description || '',
    }));
    const seen = new Set();
    const all = [...appts, ...imps, ...evs].filter((item) => {
      const key = item.type === 'appointment'
        ? `${item.type}:${item._id || item.id || `${item.date}|${item.time}|${item.title}`}`
        : eventAliasKey(item);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    all.sort((a, b) => {
      const ta = a.time ? a.time : '24:00';
      const tb = b.time ? b.time : '24:00';
      if (ta < tb) return -1;
      if (ta > tb) return 1;
      return (a.title || '').localeCompare(b.title || '');
    });
    return all;
  }, [appointments, events, important]);

  function openNewAppointment() {
    setEditingAppointment(null);
    setShowApptModal(true);
  }

  function openEditAppointment(appointment) {
    setEditingAppointment(appointment);
    setShowApptModal(true);
  }

  async function deleteAppointment(appointment) {
    const id = getStoredAppointmentId(appointment);
    if (!id) return;
    if (!window.confirm(getAppointmentDeleteConfirmation(appointment))) return;
    try {
      await axios.delete(`/api/appointments/${encodeURIComponent(id)}`);
      loadAgenda();
    } catch (err) {
      console.error('delete appointment failed', err?.response?.data || err.message);
    }
  }

  return (
    <main className="daily-page">
      <header className="daily-header">
        <div className="centered-header">
          <button className="button nav-arrow" onClick={() => go(-1)} aria-label="Previous day">◀</button>
          <h2 className="font-echo text-2xl text-plum">{toDisplayDate(dateISO)}</h2>
          <button className="button nav-arrow" onClick={() => go(1)} aria-label="Next day">▶</button>

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
          <button
            className="button rounded-button bg-lantern px-4 py-2 font-thread text-ink shadow-soft transition-all hover:bg-plum hover:text-mist"
            onClick={() => setShowEntryModal(true)}
          >
            + New Entry
          </button>
          <button
            className="button rounded-button bg-spool px-4 py-2 font-thread text-ink shadow-soft transition-all hover:bg-plum hover:text-mist"
            onClick={openNewAppointment}
          >
            + Add appointment
          </button>
        </div>
      </header>

      <NotesSection date={dateISO} />

      <section className="daily-layout">
        <div className="daily-main">
          <div className="panel daily-task-panel">
            <h3 className="daily-section-heading">Due Today</h3>
            {renderSafe(
              TaskList,
              { key: `due-${taskListKey}`, date: dateISO, bucket: 'dueToday', header: null, keepCompleted: false },
              'TaskList'
            )}
            <h3 className="daily-section-heading daily-section-heading--spaced">On Your Radar</h3>
            {renderSafe(
              TaskList,
              { key: `radar-${taskListKey}`, date: dateISO, bucket: 'onYourRadar', header: null, keepCompleted: false },
              'TaskList'
            )}
            <div className="daily-suggestions">
              <div className="side-header">
                <h3 className="daily-section-heading">Suggested Tasks</h3>
                <Link className="button chip" to={`/inbox/tasks/${dateISO}`}>Task inbox</Link>
              </div>
              {renderSafe(
                SuggestedTasksInbox,
                {
                  key: `suggested-tasks-${suggestionsKey}-${dateISO}`,
                  dateISO,
                  onAccepted: refreshAutomationPanels,
                  onRejected: refreshAutomationPanels,
                },
                'SuggestedTasksInbox'
              )}
              <div className="suggestion-links">
                <Link to="/gather-lists">Gather suggestions</Link>
                <Link to="/interests">Interest suggestions</Link>
              </div>
              <div className="other-suggestions" aria-live="polite">
                <div className="other-suggestions__header">
                  <span>Other Suggestions</span>
                  {loadingOtherSuggestions && <span className="muted">Loading...</span>}
                </div>
                {otherSuggestionsError && <div className="muted">{otherSuggestionsError}</div>}
                {!otherSuggestionsError && (
                  <div className="other-suggestions__grid">
                    <Link to="/gather-lists" className="other-suggestions__item">
                      <strong>{otherSuggestionCounts.gather}</strong>
                      <span>Gather items</span>
                    </Link>
                    <Link to="/interests" className="other-suggestions__item">
                      <strong>{otherSuggestionCounts.interests}</strong>
                      <span>Interests</span>
                    </Link>
                  </div>
                )}
              </div>
            </div>
            <DailyRipples key={rippleListKey} date={dateISO} />
          </div>

          <div className="panel">
            <div className="entries-header">
              <h3 className="font-thread text-vein">Today’s Entries</h3>
              <button
                className="button chip"
                onClick={() => {
                  const next = !unassignedOnly;
                  setUnassignedOnly(next);
                  localStorage.setItem('entries_unassigned_only', next ? '1' : '0');
                  setEntries(prev => next
                    ? prev.filter(e => !e?.cluster || e.cluster === '')
                    : prev
                  );
                }}
                title="Show only entries without a cluster"
              >
                {unassignedOnly ? 'Showing: Unassigned' : 'Showing: All'}
              </button>
            </div>

            {loadingEntries && <p className="muted">Loading entries...</p>}
            {!loadingEntries && entries.length === 0 && (
              <p className="muted">{unassignedOnly ? 'No unassigned entries 🎉' : 'No entries yet.'}</p>
            )}

            {entries.map(en => {
              const safeText =
                toDisplay(en?.text ?? en?.content ?? '') || <span className="muted">(no text)</span>;
              return (
                <div key={en._id} className="entry-card">
                  <div className="entry-text">{safeText}</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    {renderSafe(EntryQuickAssign, {
                      entry: en,
                      onUpdated: handleEntryUpdated,
                      onTaskCreated: handleTaskCreated
                    }, 'EntryQuickAssign')}

                    {renderSafe(AnalyzeEntryButton, {
                      entryId: en._id,
                      text: (typeof en?.text === 'string' ? en.text : ''),
                      date: (en.date || en.dateISO || dateISO),
                      onRipples: () => setRippleListKey(k => k + 1)
                    }, 'AnalyzeEntryButton')}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <aside className="daily-side">
          <div className="panel">
            <div className="side-header">
              <h3 className="font-thread text-vein">Appointments & Events</h3>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="button chip" onClick={loadAgenda} title="Refresh agenda">Refresh</button>
              </div>
            </div>

            {loadingAgenda && <p className="muted">Loading…</p>}
            {!loadingAgenda && timeline.length === 0 && (
              <p className="muted">Nothing scheduled or logged for this day.</p>
            )}

            {!loadingAgenda && timeline.length > 0 && (
              <ul className="agenda-list">
                {timeline.map(item => {
                  const appointmentDetails = item.type === 'appointment'
                    ? getAppointmentDetailParts(item, formatHM)
                    : [];

                  return (
                    <li key={`${item.type}-${item._id}`} className="agenda-item">
                      <span className="agenda-bullet" aria-hidden="true">
                        {item.type === 'appointment' ? '🗓️' : item.type === 'important' ? '⭐' : '📌'}
                      </span>
                      <div className="agenda-main">
                        <div className="agenda-title">
                          {item.title}
                          {item.type === 'important' && <span className="muted" style={{ marginLeft: 8 }}>(Important)</span>}
                        </div>
                        <div className="agenda-meta muted">
                          {item.type === 'appointment' ? appointmentDetails.join(' · ') : 'All day'}
                        </div>
                        {item.type === 'appointment' && item.details && (
                          <div className="agenda-meta muted" style={{ marginTop: 3 }}>
                            {item.details}
                          </div>
                        )}
                        {item.type === 'appointment' && (
                          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                            <button type="button" className="button chip" onClick={() => openEditAppointment(item)} title="Edit appointment">Edit</button>
                            <button type="button" className="button chip" onClick={() => deleteAppointment(item)} title="Delete appointment">Delete</button>
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="panel">
            <div className="side-header" style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <h3 className="font-thread text-vein">Hourly Schedule</h3>
              <button
                className="button chip"
                onClick={() => {
                  const next = !showSchedule;
                  setShowSchedule(next);
                  localStorage.setItem('show_sched', next ? '1' : '0');
                }}
              >
                {showSchedule ? 'Hide' : 'Show'}
              </button>
            </div>

            {showSchedule ? (
              <div style={{ marginTop: 8 }}>
                <HourlySchedule date={dateISO} />
              </div>
            ) : (
              <p className="muted" style={{ marginTop: 4 }}>Hidden</p>
            )}
          </div>

          <div className="panel">
            <h3 className="font-thread text-vein">Habits</h3>
            <p className="muted font-glow">Coming in Phase 4.</p>
          </div>
        </aside>
      </section>

      {showEntryModal &&
        renderSafe(EntryModal, {
          defaultDate: dateISO,
          onClose: () => setShowEntryModal(false),
          onSaved: () => {
            setTaskListKey(k => k + 1);
            loadEntries();
            loadAgenda();
            setRippleListKey(k => k + 1);
            setSuggestionsKey(k => k + 1);
            loadOtherSuggestionCounts();
          },
          onAnalyzed: () => setRippleListKey(k => k + 1),
        }, 'EntryModal')
      }

      {showApptModal &&
        renderSafe(AppointmentModal, {
          defaultDate: dateISO,
          initialAppointment: editingAppointment,
          onClose: () => {
            setShowApptModal(false);
            setEditingAppointment(null);
            loadAgenda();
          },
          onSaved: () => {
            setShowApptModal(false);
            setEditingAppointment(null);
            loadAgenda();
          }
        }, 'AppointmentModal')
      }
    </main>
  );
}
