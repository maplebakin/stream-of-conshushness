// frontend/src/pages/InboxTasksPage.jsx
import React, { useMemo, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import SuggestedTasksInbox from '../SuggestedTasksInbox.jsx';
import '../Main.css';

// Toronto-safe YYYY-MM-DD
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

export default function InboxTasksPage() {
  const { date: routeDate } = useParams();
  const navigate = useNavigate();

  // If no date provided, redirect to today for a stable URL
  useEffect(() => {
    if (!routeDate) {
      navigate(`/inbox/tasks/${todayISOInToronto()}`, { replace: true });
    }
  }, [routeDate, navigate]);

  const dayISO = useMemo(() => routeDate || todayISOInToronto(), [routeDate]);

  const go = (offsetDays) => {
    const d = new Date(dayISO + 'T00:00:00');
    d.setDate(d.getDate() + offsetDays);
    navigate(`/inbox/tasks/${toISO(d)}`);
  };

  return (
    <main className="daily-page">
      <header className="daily-header">
        <div className="centered-header">
          <button className="button nav-arrow" onClick={() => go(-1)} aria-label="Previous day">◀</button>
          <h2 className="font-echo text-plum text-2xl">Task Inbox</h2>
          <button className="button nav-arrow" onClick={() => go(1)} aria-label="Next day">▶</button>

          {dayISO !== todayISOInToronto() && (
            <button
              className="button today-btn"
              onClick={() => navigate(`/inbox/tasks/${todayISOInToronto()}`)}
              title="Jump to today"
            >
              Today
            </button>
          )}

          <span className="daily-date font-glow text-vein" title="ISO date">{dayISO}</span>
        </div>
      </header>

      <section className="daily-layout">
        <div className="daily-main">
          <div className="panel">
            <h3 className="font-thread text-vein">Suggested Tasks</h3>
            <SuggestedTasksInbox
              dateISO={dayISO}
              onAccepted={() => {
                // if you navigate back to Daily after accepting, tasks for this day will already be correct
                // if you want cross-page refreshes, wire a global invalidate here later
              }}
            />
          </div>
        </div>

        <aside className="daily-side">
          <div className="panel">
            <h3 className="font-thread text-vein">What is this?</h3>
            <p className="muted font-glow">
              Tasks extracted from your entries. Accept to place them on {dayISO}, or reject to dismiss.
            </p>
          </div>
        </aside>
      </section>
    </main>
  );
}
