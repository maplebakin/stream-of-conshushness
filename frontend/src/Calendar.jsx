// src/Calendar.jsx
import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import './Calendar.css';

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

export default function Calendar() {
  const navigate = useNavigate();
  const tzToday = todayISOInTZ('America/Toronto');

  // Build current month grid
  const now = new Date();
  const y = now.getFullYear();
  const mIdx = now.getMonth();
  const firstWeekday = new Date(y, mIdx, 1).getDay(); // 0..6 Sun..Sat
  const totalDays = daysInMonth(y, mIdx);

  const cells = useMemo(() => {
    const arr = [];
    for (let i = 0; i < firstWeekday; i++) arr.push(null);
    for (let d = 1; d <= totalDays; d++) arr.push(d);
    while (arr.length % 7 !== 0) arr.push(null);
    return arr;
  }, [firstWeekday, totalDays]);

  const weekLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <main className="calendar-page">
      <header className="calendar-header">
        <div className="title">
          <h2>{now.toLocaleString(undefined, { month: 'long' })} {y}</h2>
          <span className="subtitle">{tzToday}</span>
        </div>
        <div>
          <button className="button" onClick={() => navigate('/today')}>Today</button>
        </div>
      </header>

      <div className="calendar-grid">
        {weekLabels.map((w) => (
          <div key={w} className="calendar-weekday">{w}</div>
        ))}

        {cells.map((d, i) => {
          const iso = d ? toISO(y, mIdx, d) : '';
          const isTodayCell = d && iso === tzToday;

          return (
            <button
              key={i}
              className={`calendar-cell ${d ? '' : 'empty'} ${isTodayCell ? 'today' : ''}`}
              disabled={!d}
              onClick={() => d && navigate(`/day/${iso}`)}
              aria-label={d ? `Open ${iso}` : 'Empty'}
              title={d ? iso : ''}
            >
              {/* Day number (styled by .calendar-daynum) */}
              {d ? <span className="calendar-daynum">{d}</span> : null}

              {/* Content stack (mini pills or previews later) */}
              <div className="calendar-content">
                {/* Example placeholder; real items come later */}
                {/* <span className="calendar-item event">Dentist 3pm</span> */}
              </div>

              {/* Tiny dot counters row (optional) */}
              {d ? (
                <div className="calendar-dots">
                  {/* <span className="calendar-dot event" /> */}
                  {/* <span className="calendar-dot task" /> */}
                </div>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="calendar-legend">
        <span className="legend-item"><span className="legend-swatch event" />Events</span>
        <span className="legend-item"><span className="legend-swatch task" />Tasks</span>
        <span className="legend-item"><span className="legend-swatch entry" />Entries</span>
      </div>
    </main>
  );
}
