// Backend-focused Toronto date helpers.
// Keep frontend date helpers in frontend/src/utils/date.js separate.

import { isValidISODate } from './recurrence.js';

export const TORONTO_TZ = 'America/Toronto';
export const TZ = TORONTO_TZ;

export function todayISOInTZ(timeZone = TORONTO_TZ, base = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = fmt.formatToParts(base);
  const y = parts.find((p) => p.type === 'year')?.value || '0000';
  const m = parts.find((p) => p.type === 'month')?.value || '01';
  const d = parts.find((p) => p.type === 'day')?.value || '01';
  return `${y}-${m}-${d}`;
}

export function torontoYmd(base = new Date()) {
  return todayISOInTZ(TORONTO_TZ, base);
}

// Back-compat alias for older callers that expected a generic today helper.
export function todayISO(base = new Date()) {
  return torontoYmd(base);
}

// Normalize an input to YYYY-MM-DD in Toronto, preserving Toronto-first behavior.
export function normalizeDate(value, timeZone = TORONTO_TZ) {
  if (!value) return todayISOInTZ(timeZone);
  const str = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    if (!isValidISODate(str)) throw new RangeError('Invalid calendar date');
    return str;
  }
  const dt = new Date(str);
  if (Number.isNaN(dt.getTime())) throw new RangeError('Invalid calendar date');
  return todayISOInTZ(timeZone, dt);
}

// Add N days to a YYYY-MM-DD string using noon-anchored UTC math to avoid TZ rollback.
export function addDaysISO(iso, days, timeZone = TORONTO_TZ) {
  const [y, m, d] = String(iso).split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1, 12));
  dt.setUTCDate(dt.getUTCDate() + Number(days || 0));
  return todayISOInTZ(timeZone, dt);
}

// Keep this local-date formatter available for server-side utilities if needed.
export function toISODateLocal(dateLike) {
  const date = dateLike instanceof Date ? dateLike : new Date(dateLike);
  if (Number.isNaN(date.getTime())) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
