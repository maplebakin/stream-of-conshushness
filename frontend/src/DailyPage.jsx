// frontend/src/DailyPage.jsx
import React, { useEffect, useMemo, useState, useContext, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from './api/axiosInstance';
import { AuthContext } from './AuthContext.jsx';

import TaskList from './adapters/TaskList.default.jsx';
import EntryQuickAssign from './adapters/EntryQuickAssign.default.jsx';
import AnalyzeEntryButton from './adapters/AnalyzeEntryButton.default.jsx';
import EntryModal from './adapters/EntryModal.default.jsx';
import AppointmentModal from './adapters/AppointmentModal.default.jsx';

import DailyRipples from './DailyRipples.jsx';
import HourlySchedule from './HourlySchedule.jsx';
import NotesSection from './NotesSection.jsx';

import { renderSafe } from './utils/safeRender.js';
import { toDisplayDate } from './utils/date.js';
import { toDisplay } from './utils/display.js';

import './Main.css';
import './dailypage.css';

/* ---------- Toronto-safe date helpers ---------- */
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
function formatHM(hhmm) {
  if (!hhmm) return null;
  const [hStr, mStr] = hhmm.split(':');
  if (hStr == null || mStr == null) return hhmm;
  const h = Number(hStr), m = Number(mStr);
  const ampm = h < 12 ? 'AM' : 'PM';
  const hour12 = ((h % 12) || 12);
  return `${hour12}:${String(m).padStart(2,'0')} ${ampm}`;
}

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

/* ===================================================== */
export default function DailyPage() {
  const { date: routeDate } = useParams();
  const navigate = useNavigate();
  const { token } = useContext(AuthContext);

  const todayISO = useMemo(() => todayISOInToronto(), []);
  const [dateISO, setDateISO] = useState(routeDate || todayISO);

  const [taskListKey, setTaskListKey] = useState(0);
  const [rippleListKey, setRippleListKey] = useState(0);
  const [showEntryModal, setShowEntryModal] = useState(false);
  const [showApptModal, setShowApptModal] = useState(false);
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

  const loadEntries = useCallback(async () => {
    if (!token || !dateISO) return;
    setLoadingEntries(true);
    try {
      const res = await axios.get(`/api/entries/by-date/${dateISO}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      let list = Array.isArray(res.data) ? res.data : [];
      list = list.filter(e => entryDateISO(e) === dateISO);
      list = list.filter(entryHasMeaningfulText);
      if (unassignedOnly) list = list.filter(e => !e?.cluster || e.cluster === '');
      setEntries(list);
    } catch (err) {
      console.error('loadEntries error', err?.message || err);
      setEntries([]);
    } finally {
      setLoadingEntries(false);
    }
  }, [token, dateISO, unassignedOnly]);

  useEffect(() => { loadEntries(); }, [loadEntries]);

  function handleEntryUpdated(updated) {
    const stillToday = entryDateISO(updated) === dateISO && entryHasMeaningfulText(updated);
    setEntries(prev => {
      const next = prev.map(e => e._id === updated._id ? updated : e);
      return stillToday ? next : next.filter(e => e._id !== updated._id);
    });
    if (stillToday && unassignedOnly && updated.cluster && updated.cluster !== '') {
      setEntries(prev => prev.filter(e => e._id !== updated._id));
    }
  }
  function handleTaskCreated() {
    setTaskListKey(k => k + 1);
  }

  const loadAgenda = useCallback(async () => {
    if (!token || !dateISO) return;
    setLoadingAgenda(true);
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const qs = `from=${dateISO}&to=${dateISO}`;
      const [apptRes, evtRes, impRes] = await Promise.all([
        axios.get(`/api/appointments?${qs}`,      { headers }),
        axios.get(`/api/events?${qs}`,            { headers }),
        axios.get(`/api/important-events?${qs}`,  { headers }).catch(() => ({ data: [] })),
      ]);
      setAppointments(Array.isArray(apptRes.data) ? apptRes.data : []);
      setEvents(Array.isArray(evtRes.data) ? evtRes.data : []);
      setImportant(Array.isArray(impRes.data) ? impRes.data : []);
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
      _id: a._id,
      type: 'appointment',
      title: a.title || '(untitled)',
      date: a.date,
      time: a.timeStart || null,
      location: a.location || '',
    }));
    const evs = (events || []).map(e => ({
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
    const all = [...appts, ...imps, ...evs];
    all.sort((a, b) => {
      const ta = a.time ? a.time : '24:00';
      const tb = b.time ? b.time : '24:00';
      if (ta < tb) return -1;
      if (ta > tb) return 1;
      return (a.title || '').localeCompare(b.title || '');
    });
    return all;
  }, [appointments, events, important]);

  return (
    <main className="daily-page">
      <header className="daily-header">
        <div className="centered-header">
          <button className="button nav-arrow" onClick={() => go(-1)} aria-label="Previous day">◀</button>
          <h2 className="font-echo text-plum text-2xl">{toDisplayDate(dateISO)}</h2>
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
          <button
            className="button bg-lantern text-ink rounded-button px-4 py-2 font-thread shadow-soft hover:bg-plum hover:text-mist transition-all"
            onClick={() => setShowEntryModal(true)}
          >
            + New Entry
          </button>
          <button
            className="button bg-spool text-ink rounded-button px-4 py-2 font-thread shadow-soft hover:bg-plum hover:text-mist transition-all"
            onClick={() => setShowApptModal(true)}
          >
            + Add appointment
          </button>
        </div>
      </header>

      <section className="daily-layout">
        <div className="daily-main">
          <div className="panel">
            {renderSafe(
              TaskList,
              { key: taskListKey, date: dateISO, header: "Today’s Tasks", keepCompleted: true },
              'TaskList'
            )}
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
                {timeline.map(item => (
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
                        {item.type === 'appointment' ? (
                          <>
                            {item.time ? formatHM(item.time) : 'All day'}
                            {item.location ? ` · ${item.location}` : ''}
                          </>
                        ) : (
                          <>All day</>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
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
            <NotesSection date={dateISO} />
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
          },
          onAnalyzed: () => setRippleListKey(k => k + 1),
        }, 'EntryModal')
      }

      {showApptModal &&
        renderSafe(AppointmentModal, {
          defaultDate: dateISO,
          onClose: () => {
            setShowApptModal(false);
            loadAgenda();
          }
        }, 'AppointmentModal')
      }
    </main>
  );
}
