// utils/repeat.js
// Parse common recurrence phrases into RRULE strings and compute the next date.
// No external deps (uses Intl + a bit of date math).

/* ───────── helpers ───────── */
const tz = 'America/Toronto';

function toISODate(d) {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year:'numeric', month:'2-digit', day:'2-digit' });
  const parts = fmt.formatToParts(d);
  const y = parts.find(p => p.type === 'year')?.value || '0000';
  const m = parts.find(p => p.type === 'month')?.value || '01';
  const day = parts.find(p => p.type === 'day')?.value || '01';
  return `${y}-${m}-${day}`;
}
const WK = { su:0, mo:1, tu:2, we:3, th:4, fr:5, sa:6 };
const WK_STR = ['SU','MO','TU','WE','TH','FR','SA'];

function addDays(d, n){ const x = new Date(d); x.setDate(x.getDate()+n); return x; }
function addMonths(d,n){ const x = new Date(d); x.setMonth(x.getMonth()+n); return x; }

function nextWeekly(ref, byweekday, interval=1) {
  // find next occurrence on or after tomorrow across interval weeks
  const start = addDays(ref, 1);
  for (let w=0; w<interval*7+14; w++) {
    const probe = addDays(start, w);
    const day = probe.getDay();
    // respect interval by ISO week distance from ref
    const weeksDiff = Math.floor(((probe - ref) / 86400000) / 7);
    if (weeksDiff % interval === 0 && byweekday.includes(day)) return probe;
  }
  return null;
}
function nthWeekdayOfMonth(year, month, weekday, n) {
  // n: 1..4 or -1 (last). month: 0..11
  if (n === -1) {
    // last weekday of month
    const last = new Date(year, month + 1, 0);
    let d = last.getDate();
    while (last.getDay() !== weekday) { d--; last.setDate(d); }
    return last;
  }
  const first = new Date(year, month, 1);
  const firstW = first.getDay();
  const delta = (weekday - firstW + 7) % 7;
  const day = 1 + delta + (n - 1) * 7;
  const dt = new Date(year, month, day);
  if (dt.getMonth() !== month) return null;
  return dt;
}

function nextMonthlyByMonthday(ref, monthday, interval=1) {
  const y = ref.getFullYear(); const m = ref.getMonth(); const d = ref.getDate();
  const thisMonth = new Date(y, m, monthday);
  if (monthday >= d) return thisMonth;
  return new Date(y, m + interval, monthday);
}
function nextMonthlyByNthWeekday(ref, weekday, n, interval=1) {
  const y = ref.getFullYear(); const m = ref.getMonth();
  const candidate = nthWeekdayOfMonth(y, m, weekday, n);
  if (candidate && candidate >= addDays(ref,1)) return candidate;
  const next = nthWeekdayOfMonth(y, m + interval, weekday, n);
  return next;
}
function parseOrdinal(word) {
  const map = { first:1, 1:1, second:2, 2:2, third:3, 3:3, fourth:4, 4:4, last:-1 };
  return map[word?.toLowerCase()] ?? null;
}
function parseWeekdayToken(tok){
  const m = tok.slice(0,3).toLowerCase();
  return WK[m] ?? null;
}
function collectWeekdays(listStr) {
  // e.g., "monday, wednesday and friday"
  const parts = listStr.split(/[,/&]|and/i).map(s => s.trim()).filter(Boolean);
  const out = [];
  for (const p of parts) {
    const w = parseWeekdayToken(p);
    if (w != null) out.push(w);
  }
  return [...new Set(out)];
}

/* ───────── main parse ───────── */
export function parseRepeat(text, refDate=new Date()) {
  if (!text) return null;
  const t = String(text).toLowerCase();

  // base defaults
  const res = { freq:null, interval:1, byweekday:[], bymonthday:null, bysetpos:null, bymonth:null, until:null, count:null };

  // quick flags
  if (/\b(daily|every day)\b/.test(t)) res.freq = 'DAILY';
  if (/\b(weekly|every week)\b/.test(t)) res.freq = 'WEEKLY';
  if (/\b(monthly|every month)\b/.test(t)) res.freq = 'MONTHLY';
  if (/\b(annually|yearly|every year)\b/.test(t)) res.freq = 'YEARLY';
  if (/\bquarterly\b/.test(t)) { res.freq='MONTHLY'; res.interval=3; }

  // every other / every N
  const everyOther = t.match(/\bevery\s+other\s+(day|week|month|year)s?\b/);
  if (everyOther) { res.freq = everyOther[1].toUpperCase() + 'LY'; res.interval = 2; }
  const everyN = t.match(/\bevery\s+(\d+)\s+(day|week|month|year)s?\b/);
  if (everyN) { res.freq = everyN[2].toUpperCase() + 'LY'; res.interval = Math.max(1, parseInt(everyN[1],10)); }

  // weekdays / weekends
  if (/\bweekdays?\b/.test(t)) { res.freq='WEEKLY'; res.byweekday=[WK.mo,WK.tu,WK.we,WK.th,WK.fr]; }
  if (/\bweekends?\b/.test(t)) { res.freq='WEEKLY'; res.byweekday=[WK.sa,WK.su]; }

  // specific weekdays list: "every monday", "every mon & wed & fri"
  const everyWd = t.match(/\bevery\s+((?:mon|tue|wed|thu|thur|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday)(?:[^a-z]+(?:mon|tue|wed|thu|thur|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday))*)\b/);
  if (everyWd) {
    res.freq = 'WEEKLY';
    res.byweekday = collectWeekdays(everyWd[1]);
  }

  // monthly "first/last/2nd <weekday> (of the month)"
  const ordWd = t.match(/\bevery\s+(first|second|third|fourth|last)\s+(mon|tue|wed|thu|thur|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday)(?:\s+of\s+the\s+month)?\b/);
  if (ordWd) {
    res.freq='MONTHLY';
    res.bysetpos = parseOrdinal(ordWd[1]);
    res.byweekday = [ parseWeekdayToken(ordWd[2]) ];
  }

  // monthly by monthday: "every month on the 15th"
  const byMonthday = t.match(/\bevery\s+month\s+(?:on\s+)?the\s+(\d{1,2})(?:st|nd|rd|th)?\b/);
  if (byMonthday) { res.freq='MONTHLY'; res.bymonthday = Math.max(1, Math.min(31, parseInt(byMonthday[1],10))); }

  // yearly on month/day: "every year on june 5", "june 5 every year"
  const monthNames = ['january','february','march','april','may','june','july','august','september','october','november','december'];
  const mdy = t.match(new RegExp(`\\b(${monthNames.join('|')})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b.*\\bevery\\s+year\\b`));
  const everyYearOn = t.match(new RegExp(`\\bevery\\s+year\\s+on\\s+(${monthNames.join('|')})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`));
  const mdyHit = mdy || everyYearOn;
  if (mdyHit) {
    res.freq='YEARLY';
    res.bymonth = monthNames.indexOf(mdyHit[1]) + 1;
    res.bymonthday = parseInt(mdyHit[2],10);
  }

  // if we didn't detect anything, bail
  if (!res.freq) return null;

  // Build RRULE
  const parts = [`FREQ=${res.freq}`];
  if (res.interval && res.interval !== 1) parts.push(`INTERVAL=${res.interval}`);
  if (res.byweekday.length) parts.push(`BYDAY=${res.byweekday.map(d=>WK_STR[d]).join(',')}`);
  if (res.bymonthday != null) parts.push(`BYMONTHDAY=${res.bymonthday}`);
  if (res.bysetpos != null && res.byweekday.length === 1) parts.push(`BYSETPOS=${res.bysetpos}`);
  if (res.bymonth != null) parts.push(`BYMONTH=${res.bymonth}`);
  const rrule = parts.join(';');

  // Compute a reasonable next occurrence for due date if none parsed elsewhere
  let next = null;
  const ref = refDate instanceof Date ? refDate : new Date(refDate);

  if (res.freq === 'DAILY') next = addDays(ref, res.interval);
  else if (res.freq === 'WEEKLY') {
    const days = res.byweekday.length ? res.byweekday : [ref.getDay()];
    next = nextWeekly(ref, days, res.interval);
  } else if (res.freq === 'MONTHLY') {
    if (res.bymonthday != null) next = nextMonthlyByMonthday(ref, res.bymonthday, res.interval);
    else if (res.bysetpos != null && res.byweekday.length === 1) next = nextMonthlyByNthWeekday(ref, res.byweekday[0], res.bysetpos, res.interval);
    else next = addMonths(ref, res.interval);
  } else if (res.freq === 'YEARLY') {
    const y = ref.getFullYear();
    const target = new Date(y, (res.bymonth ?? ref.getMonth()+1)-1, res.bymonthday ?? ref.getDate());
    next = target > ref ? target : new Date(y+1, (res.bymonth ?? ref.getMonth()+1)-1, res.bymonthday ?? ref.getDate());
  }

  return { ...res, rrule, nextISO: next ? toISODate(next) : undefined };
}

/* Humanizer (for UI chips) */
export function humanizeRRULE(rrule) {
  if (!rrule) return '';
  const m = Object.fromEntries(rrule.split(';').map(kv => kv.split('=')));
  const F = m.FREQ; const I = m.INTERVAL ? parseInt(m.INTERVAL,10) : 1;
  const byday = m.BYDAY ? m.BYDAY.split(',') : [];
  const bymd  = m.BYMONTHDAY ? parseInt(m.BYMONTHDAY,10) : null;
  const bset  = m.BYSETPOS ? parseInt(m.BYSETPOS,10) : null;
  const bmon  = m.BYMONTH ? parseInt(m.BYMONTH,10) : null;

  const ordWord = (n)=>({1:'first',2:'second',3:'third',4:'fourth','-1':'last'}[String(n)]||`#${n}`);
  if (F==='DAILY') return I===1 ? 'Every day' : `Every ${I} days`;
  if (F==='WEEKLY') {
    const days = byday.length ? byday.join(', ') : 'week';
    return I===1 ? `Every ${days}` : `Every ${I} weeks on ${days}`;
    }
  if (F==='MONTHLY') {
    if (bmd) return I===1 ? `Every month on the ${bmd}` : `Every ${I} months on the ${bmd}`;
    if (bset && byday.length===1) return I===1 ? `Every ${ordWord(bset)} ${byday[0]} each month` : `Every ${I} months on the ${ordWord(bset)} ${byday[0]}`;
    return I===1 ? 'Every month' : `Every ${I} months`;
  }
  if (F==='YEARLY') {
    if (bmon && bmd) return `Every year on ${bmon}/${bmd}`;
    return I===1 ? 'Every year' : `Every ${I} years`;
  }
  return rrule;
}
