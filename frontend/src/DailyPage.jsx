// frontend/src/DailyPage.jsx
import React, { useEffect, useMemo, useState, useContext } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from './api/axiosInstance';
import { AuthContext } from './AuthContext.jsx';
import TaskList from './adapters/TaskList.default.jsx';
import DailyRipples from './DailyRipples.jsx'
import EntryQuickAssign from './adapters/EntryQuickAssign.default.jsx';
import AnalyzeEntryButton from './adapters/AnalyzeEntryButton.default.jsx';
import EntryModal from './adapters/EntryModal.default.jsx';
import AppointmentModal from './adapters/AppointmentModal.default.jsx';
import { renderSafe } from './utils/safeRender.js';
import { toDisplayDate } from './utils/date.js';
import { toDisplay } from './utils/display.js'; // ← render-safe guard
import './Main.css';
import './dailypage.css';

console.log('DailyRipples import is', DailyRipples);

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

  const [taskListKey, setTaskListKey] = useState(0);
  const [showEntryModal, setShowEntryModal] = useState(false);
  const [showApptModal, setShowApptModal] = useState(false);
  const [autoCarry, setAutoCarry] = useState(() => localStorage.getItem('auto_cf') === '1');

  // ENTRIES
  const [entries, setEntries] = useState([]);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [unassignedOnly, setUnassignedOnly] = useState(() =>
    localStorage.getItem('entries_unassigned_only') === '1'
  );

  useEffect(() => {
    if (!routeDate) {
      navigate(`/day/${dateISO}`, { replace: true });
    } else {
      setDateISO(routeDate);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeDate]);

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

  // Load entries for the day
  async function loadEntries() {
    if (!token) return;
    setLoadingEntries(true);
    try {
      const params = new URLSearchParams({ date: dateISO });
      if (unassignedOnly) params.set('unassignedCluster', 'true');

      const res = await axios.get(`/api/entries?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setEntries(Array.isArray(res.data) ? res.data : []);
    } catch {
      setEntries([]);
    } finally {
      setLoadingEntries(false);
    }
  }
  useEffect(() => { loadEntries(); }, [dateISO, token, unassignedOnly]);

  function handleEntryUpdated(updated) {
    setEntries(prev => prev.map(e => e._id === updated._id ? updated : e));
    if (unassignedOnly && updated.cluster && updated.cluster !== '') {
      setEntries(prev => prev.filter(e => e._id !== updated._id));
    }
  }
  function handleTaskCreated() {
    setTaskListKey(k => k + 1);
  }

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
            {renderSafe(TaskList, { key: taskListKey, date: dateISO, header: "Today’s Tasks" }, 'TaskList')}
          </div>

          {/* Ripples ABOVE entries */}
          <div className="panel">
            {renderSafe(DailyRipples, { date: dateISO }, 'DailyRipples')}
          </div>

          {/* Today’s Entries Panel */}
          <div className="panel">
            <div className="entries-header">
              <h3 className="font-thread text-vein">Today’s Entries</h3>
              <button
                className="button chip"
                onClick={() => {
                  const next = !unassignedOnly;
                  setUnassignedOnly(next);
                  localStorage.setItem('entries_unassigned_only', next ? '1' : '0');
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
              // Render-safe entry text: tolerate strings, numbers, booleans; stringify arrays/objects.
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
  entryText: typeof en?.text === 'string' ? en.text : '',
  entryDateISO: en.date || en.dateISO || dateISO
}, 'AnalyzeEntryButton')}

                  </div>
                </div>
              );
            })}
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

      {showEntryModal &&
  renderSafe(EntryModal, {
    defaultDate: dateISO,
    onClose: () => setShowEntryModal(false),
    onSaved: () => { setTaskListKey(k => k + 1); loadEntries(); }
  }, 'EntryModal')
}

{showApptModal &&
  renderSafe(AppointmentModal, {
    defaultDate: dateISO,
    onClose: () => setShowApptModal(false)
  }, 'AppointmentModal')
}

        
      
    </main>
  );
}
