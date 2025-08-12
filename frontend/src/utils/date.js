// src/utils/date.js
export const TZ = 'America/Toronto';

// zero-dep, local day (safe)
export function todayISO() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2,'0');
  const d = String(now.getDate()).padStart(2,'0');
  return `${y}-${m}-${d}`;
}

// helper to make YYYY-MM-DD from a JS Date without UTC shift
export function toISODateLocal(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2,'0');
  const d = String(date.getDate()).padStart(2,'0');
  return `${y}-${m}-${d}`;
}

// === Added exports to match MainPage.jsx ===

// Alias for historical naming
export function getLocalTodayISO() {
  return todayISO();
}

// Human-friendly "Mon, Aug 08, 2025" from YYYY-MM-DD or Date
export function toDisplayDate(input) {
  let d;
  if (typeof input === 'string') {
    // expecting YYYY-MM-DD
    const [y, m, day] = input.split('-').map(Number);
    d = new Date(y, (m || 1) - 1, day || 1);
  } else if (input instanceof Date) {
    d = input;
  } else {
    d = new Date();
  }
  return d.toLocaleDateString('en-CA', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: '2-digit'
  });
}
