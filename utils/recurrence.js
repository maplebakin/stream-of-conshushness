// utils/recurrence.js
// Pragmatic RRULE expansion for DAILY/WEEKLY/MONTHLY within a date range.
// All dates are YYYY-MM-DD (UTC), no timezones here.

const DOW = { SU:0, MO:1, TU:2, WE:3, TH:4, FR:5, SA:6 };

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
function addMonths(d, n) { const x = new Date(d.getTime()); x.setUTCMonth(x.getUTCMonth() + n); return x; }

function weekKey(d) {
  const jan1 = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const diffDays = Math.floor((d - jan1) / (24 * 60 * 60 * 1000));
  return d.getUTCFullYear() * 100 + Math.floor(diffDays / 7);
}

// Expand a recurrence series into dates within [fromISO, toISO] inclusive.
export function expandDatesInRange(rruleStr, startISO, fromISO, toISO) {
  const R = parseRRule(rruleStr);
  if (!R.FREQ) return [];

  const INTERVAL = Math.max(1, parseInt(R.INTERVAL || '1', 10));
  const UNTIL = R.UNTIL || null;

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
    while (cur <= to) {
      pushIfInRange(cur);
      cur = addDays(cur, INTERVAL);
    }
    return out;
  }

  // WEEKLY (+BYDAY)
  if (R.FREQ === 'WEEKLY') {
    const by = (R.BYDAY || '').split(',').filter(Boolean);
    const weekdays = by.length ? by.map(code => DOW[code]).filter(n => n >= 0) : null;

    // Iterate day-by-day (simple & safe), then filter and downsample by week INTERVAL.
    const dates = [];
    for (let d = cur; d <= to; d = addDays(d, 1)) {
      if (!weekdays || weekdays.includes(d.getUTCDay())) dates.push(new Date(d.getTime()));
    }
    if (INTERVAL > 1) {
      const firstWeek = weekKey(isoToDate(startISO));
      for (const d of dates) {
        if (((weekKey(d) - firstWeek) % INTERVAL) === 0) pushIfInRange(d);
      }
    } else {
      for (const d of dates) pushIfInRange(d);
    }
    return out;
  }

  // MONTHLY (same day-of-month as start)
  if (R.FREQ === 'MONTHLY') {
    const startDay = isoToDate(startISO).getUTCDate();
    let anchor = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth(), startDay));
    while (anchor <= to) {
      pushIfInRange(anchor);
      anchor = addMonths(anchor, INTERVAL);
    }
    return out;
  }

  // Unsupported FREQ → nothing
  return [];
}
