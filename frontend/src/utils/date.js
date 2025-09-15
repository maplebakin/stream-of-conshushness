// One source of truth for dates/times. Toronto-first.
// Includes compatibility shims (getLocalTodayISO, todayISOInToronto, toDisplayDate).

const DEFAULT_TZ = 'America/Toronto';

/** Parse 'YYYY-MM-DD' without TZ drift. */
export function parseISODate(iso) {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso));
  if (!m) return new Date(iso); // fallback parse
  const [, y, mo, d] = m;
  return new Date(Number(y), Number(mo) - 1, Number(d));
}

/** Today as YYYY-MM-DD in a specific IANA timezone (default: America/Toronto). */
export function todayISOInTZ(timeZone = DEFAULT_TZ) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const parts = fmt.formatToParts(new Date());
  const y = parts.find(p => p.type === 'year').value;
  const m = parts.find(p => p.type === 'month').value;
  const d = parts.find(p => p.type === 'day').value;
  return `${y}-${m}-${d}`;
}

/** COMPAT: previous code imported getLocalTodayISO — map it to Toronto by default. */
export function getLocalTodayISO(timeZone = DEFAULT_TZ) {
  return todayISOInTZ(timeZone);
}

/** COMPAT: alias used by TaskList.jsx */
export function todayISOInToronto() {
  return todayISOInTZ(DEFAULT_TZ);
}

/** Get YYYY-MM-DD from a Date in *local* environment timezone (no IANA override). */
export function toISODateLocal(dateLike) {
  const d = dateLike instanceof Date ? dateLike : new Date(dateLike);
  if (isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/**
 * Human display like "Mon, Sep 15, 2025" (Toronto by default).
 * Accepts Date or 'YYYY-MM-DD'. Pass Intl options to customize.
 */
export function toDisplayDate(dateLike, options = {}) {
  const d = typeof dateLike === 'string' ? parseISODate(dateLike) : new Date(dateLike);
  if (!d || isNaN(d.getTime())) return '';
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: DEFAULT_TZ,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    ...options
  });
  return fmt.format(d);
}

/** Format "HH:mm" into "h:mm AM/PM". */
export function formatHM(hhmm) {
  if (!hhmm) return null;
  const [hStr, mStr] = String(hhmm).split(':');
  if (hStr == null || mStr == null) return hhmm;
  const h = Number(hStr), m = Number(mStr);
  const ampm = h < 12 ? 'AM' : 'PM';
  const hour12 = (h % 12) || 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${ampm}`;
}

/**
 * 6x7 calendar grid of Date objects for a given month.
 * monthIndex: 0-11. startsOnMonday=false gives Sun-start grid.
 */
export function monthMatrix(year, monthIndex, startsOnMonday = false) {
  const first = new Date(year, monthIndex, 1);
  const startDay = first.getDay(); // 0 Sun..6 Sat
  const offset = startsOnMonday ? (startDay === 0 ? 6 : startDay - 1) : startDay;
  const start = new Date(year, monthIndex, 1 - offset);

  const weeks = [];
  for (let w = 0; w < 6; w++) {
    const row = [];
    for (let d = 0; d < 7; d++) {
      row.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + (w * 7 + d)));
    }
    weeks.push(row);
  }
  return weeks;
}

/** Tiny helper if you need to compare ISO day strings. */
export function isSameISO(a, b) {
  return String(a) === String(b);
}
