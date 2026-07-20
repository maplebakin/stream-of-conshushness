// utils/recurrence.js
// Pragmatic RRULE expansion for DAILY/WEEKLY/MONTHLY within a date range.
// All dates are YYYY-MM-DD (UTC), no timezones here.

const DOW = { SU:0, MO:1, TU:2, WE:3, TH:4, FR:5, SA:6 };
export const MAX_RECURRENCE_ITERATIONS = 10_000;

export function isValidISODate(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1000 || month < 1 || month > 12 || day < 1) return false;

  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const maxDay = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  return day <= maxDay;
}

export function parseRRule(str = '') {
  const out = {};
  if (!str) return out;
  for (const part of String(str).split(';')) {
    const [k, v] = part.split('=');
    if (!k) continue;
    out[k.toUpperCase()] = (v || '').toUpperCase();
  }
  return out;
}

const SUPPORTED_RECURRENCE_KEYS = new Set(['FREQ', 'INTERVAL', 'BYDAY', 'UNTIL', 'COUNT']);
const SUPPORTED_FREQUENCIES = new Set(['DAILY', 'WEEKLY', 'MONTHLY']);

/**
 * Validate the recurrence subset implemented by task successor generation and
 * calendar expansion. Returns an empty string when valid.
 */
export function recurrenceValidationError(rrule, startDate = '') {
  const raw = String(rrule || '').trim();
  if (!raw) return '';
  if (!isValidISODate(startDate)) return 'a valid dueDate is required for a recurring task';

  const seen = new Set();
  for (const rawPart of raw.split(';')) {
    const part = rawPart.trim();
    const separator = part.indexOf('=');
    if (separator <= 0 || separator === part.length - 1) return 'rrule contains a malformed part';
    const key = part.slice(0, separator).trim().toUpperCase();
    if (!SUPPORTED_RECURRENCE_KEYS.has(key)) return `rrule contains unsupported ${key || 'fields'}`;
    if (seen.has(key)) return `rrule contains duplicate ${key}`;
    seen.add(key);
  }

  const rule = parseRRule(raw);
  if (!SUPPORTED_FREQUENCIES.has(rule.FREQ)) return 'rrule frequency must be DAILY, WEEKLY, or MONTHLY';
  if (rule.INTERVAL && (!/^\d+$/.test(rule.INTERVAL) || Number(rule.INTERVAL) < 1)) {
    return 'rrule interval must be a positive integer';
  }
  if (rule.COUNT && (!/^\d+$/.test(rule.COUNT) || Number(rule.COUNT) < 1)) {
    return 'rrule count must be a positive integer';
  }
  if (rule.UNTIL && (!isValidISODate(rule.UNTIL) || rule.UNTIL < startDate)) {
    return 'rrule until must be a valid date on or after dueDate';
  }
  if (rule.BYDAY) {
    const days = rule.BYDAY.split(',');
    if (rule.FREQ !== 'WEEKLY' || days.some((day) => !/^(SU|MO|TU|WE|TH|FR|SA)$/.test(day))) {
      return 'rrule BYDAY is only supported for weekly rules';
    }
  }
  return '';
}

// --- ISO helpers (scoped; do NOT import anything named toISO elsewhere) ---
function isoToDate(iso) {
  const [Y, M, D] = String(iso).split('-').map(Number);
  return new Date(Date.UTC(Y, (M || 1) - 1, D || 1));
}
function dateToISO(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function addDays(d, n) { const x = new Date(d.getTime()); x.setUTCDate(x.getUTCDate() + n); return x; }
function daysInMonth(year, monthIndex) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function monthlyOccurrenceForOffset(startISO, monthOffset) {
  const [year, month, day] = String(startISO).split('-').map(Number);
  const targetMonth = (month - 1) + monthOffset;
  const targetYear = year + Math.floor(targetMonth / 12);
  const targetMonthIndex = targetMonth % 12;

  if (day > daysInMonth(targetYear, targetMonthIndex)) return '';
  return `${targetYear}-${String(targetMonthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Advance a date-only monthly recurrence without JavaScript Date overflow.
 * RRULE month-end policy: preserve the original day; months without that day
 * are skipped (never clamped and never allowed to roll into the next month).
 */
export function nextMonthlyOccurrenceISO(fromISO, interval = 1) {
  if (!isValidISODate(fromISO)) return '';
  const step = Math.max(1, Number.parseInt(interval, 10) || 1);
  for (let offset = step; offset <= 4800; offset += step) {
    const occurrence = monthlyOccurrenceForOffset(fromISO, offset);
    if (occurrence) return occurrence;
  }
  return '';
}

function startOfWeek(d, weekStart = DOW.MO) {
  const offset = (d.getUTCDay() - weekStart + 7) % 7;
  return addDays(d, -offset);
}

function weeksSince(anchor, candidate) {
  return Math.floor((startOfWeek(candidate) - startOfWeek(anchor)) / (7 * 24 * 60 * 60 * 1000));
}

// Expand a recurrence series into dates within [fromISO, toISO] inclusive.
export function expandDatesInRange(rruleStr, startISO, fromISO, toISO) {
  const R = parseRRule(rruleStr);
  if (!R.FREQ) return [];

  if (![startISO, fromISO, toISO].every(isValidISODate)) return [];
  if (fromISO > toISO) return [];
  if (R.UNTIL && !isValidISODate(R.UNTIL)) return [];

  const parsedInterval = Number.parseInt(R.INTERVAL || '1', 10);
  const INTERVAL = Number.isFinite(parsedInterval) && parsedInterval > 0 ? parsedInterval : 1;
  const UNTIL = R.UNTIL || null;
  const COUNT = Math.max(0, Number.parseInt(R.COUNT || '0', 10)) || null;

  const from = isoToDate(fromISO);
  const to   = isoToDate(toISO);
  let cur    = isoToDate(startISO);

  if (UNTIL && isoToDate(UNTIL) < from) return [];
  if (cur > to) return [];

  const out = [];
  const pushIfInRange = (d) => {
    if (d < from || d > to) return;
    if (UNTIL && d > isoToDate(UNTIL)) return;
    out.push(dateToISO(d));
  };

  // DAILY
  if (R.FREQ === 'DAILY') {
    let emitted = 0;
    let iterations = 0;
    while (cur <= to) {
      if (iterations >= MAX_RECURRENCE_ITERATIONS) break;
      iterations += 1;
      if (UNTIL && cur > isoToDate(UNTIL)) break;
      emitted += 1;
      pushIfInRange(cur);
      if (COUNT && emitted >= COUNT) break;
      cur = addDays(cur, INTERVAL);
    }
    return out;
  }

  // WEEKLY (+BYDAY)
  if (R.FREQ === 'WEEKLY') {
    const by = (R.BYDAY || '').split(',').filter(Boolean);
    const explicitWeekdays = by.map(code => DOW[code]).filter(n => n >= 0);
    // RFC 5545 defaults a weekly rule without BYDAY to DTSTART's weekday.
    // Treat an invalid/empty BYDAY the same way instead of emitting every day
    // in each eligible week.
    const weekdays = explicitWeekdays.length
      ? explicitWeekdays
      : [isoToDate(startISO).getUTCDay()];

    // Iterate day-by-day (simple & safe), then filter and downsample by week INTERVAL.
    let emitted = 0;
    let iterations = 0;
    const start = isoToDate(startISO);
    for (let d = cur; d <= to; d = addDays(d, 1)) {
      if (iterations >= MAX_RECURRENCE_ITERATIONS) break;
      iterations += 1;
      if (UNTIL && d > isoToDate(UNTIL)) break;
      if (!weekdays.includes(d.getUTCDay())) continue;
      if ((weeksSince(start, d) % INTERVAL) !== 0) continue;

      emitted += 1;
      pushIfInRange(d);
      if (COUNT && emitted >= COUNT) break;
    }
    return out;
  }

  // MONTHLY (same day-of-month as start)
  if (R.FREQ === 'MONTHLY') {
    let emitted = 0;
    let iterations = 0;

    for (let monthOffset = 0; ; monthOffset += INTERVAL) {
      if (iterations >= MAX_RECURRENCE_ITERATIONS) break;
      iterations += 1;
      const [startYear, startMonth] = String(startISO).split('-').map(Number);
      const targetMonth = (startMonth - 1) + monthOffset;
      const targetYear = startYear + Math.floor(targetMonth / 12);
      const targetMonthIndex = targetMonth % 12;
      const monthStart = `${targetYear}-${String(targetMonthIndex + 1).padStart(2, '0')}-01`;
      if (monthStart > toISO) break;

      const occurrence = monthlyOccurrenceForOffset(startISO, monthOffset);
      if (!occurrence) continue;
      if (UNTIL && occurrence > UNTIL) break;

      emitted += 1;
      if (occurrence >= fromISO && occurrence <= toISO) out.push(occurrence);
      if (COUNT && emitted >= COUNT) break;
    }
    return out;
  }

  // Unsupported FREQ → nothing
  return [];
}
