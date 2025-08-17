// utils/rippleExtractor.js
// Calmer task extraction with backward-compatible exports.
//
// New core:
//   - extractTasks(text, entryDateISO)
//   - extractRipplesFromEntry({ text, entryDate, originalContext })
//
// Back-compat shims (so you don't have to touch old code):
//   - extractEntrySuggestions(text, entryDateISO)  -> same as extractTasks
//   - extractRipples(text, entryDateISO, originalContext) -> ripples array
//
// Notes:
// - Conservative triggers: “need to / have to / must / don’t forget to / remind me to / todo:”
// - Safe dates: ISO, today/tomorrow, next <weekday>, “by YYYY-MM-DD”
// - Safe recurrence: every day / every other day / every <n> days / every <weekday>
// - No invented dates; deduped; max 3 suggestions.

const WEEKDAYS = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
const WEEKDAY_ABBR = ['sun','mon','tue','tues','wed','thu','thur','thurs','fri','sat'];

const MAX_SUGGESTIONS = 3;

// Single tokens that should never be a task alone
const BORING_SINGLE_WORDS = new Set(['day','today','tomorrow','sometime','later','soon','now','please']);

// Intent triggers (case-insensitive)
const INTENT_PATTERNS = [
  /\b(?:i|we)\s+(?:need|have)\s+to\s+/i,
  /\b(?:i|we)\s+must\s+/i,
  /\bshould\s+(?:probably\s+)?/i,
  /\bdon['’]t\s+forget\s+to\s+/i,
  /\bremind\s+me\s+to\s+/i,
  /\btodo\s*:\s*/i,
];

// Slice a clean action after an intent phrase
function sliceAction(text, startIdx) {
  const tail = text.slice(startIdx);
  const boundary = tail.search(/(?=\.|\?|!|$)|(?=,)|(?=\s+\band\b)|(?=\s+\bthen\b)/i);
  const raw = boundary === -1 ? tail : tail.slice(0, boundary);

  let action = raw
    .replace(/^\s*(to\s+)?/i, '')
    .replace(/\s+(?:please|now|soon|later)\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!action || action.length < 3) return null;
  if (!/\w/.test(action)) return null;
  if (!/\s/.test(action) && BORING_SINGLE_WORDS.has(action.toLowerCase())) return null;

  return action;
}

function dedupeByKey(items, keyFn) {
  const seen = new Set();
  const out = [];
  for (const it of items) {
    const k = keyFn(it);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(it);
  }
  return out;
}

/* ─────────── Date helpers (America/Toronto) ─────────── */

function toISO(date) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric', month: '2-digit', day: '2-digit'
  });
  const parts = fmt.formatToParts(date);
  const y = parts.find(p => p.type === 'year').value;
  const m = parts.find(p => p.type === 'month').value;
  const d = parts.find(p => p.type === 'day').value;
  return `${y}-${m}-${d}`;
}

function parseExplicitISO(s) {
  const m = s.match(/\b(20\d{2})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b/);
  return m ? m[0] : null;
}

function nextWeekdayISO(fromISO, targetDow) {
  const [Y,M,D] = fromISO.split('-').map(n => parseInt(n,10));
  const d = new Date(Date.UTC(Y, M-1, D, 12, 0, 0));
  const dow = d.getUTCDay();
  const delta = (targetDow - dow + 7) % 7 || 7;
  d.setUTCDate(d.getUTCDate() + delta);
  return toISO(d);
}

function relativeISO(keyword, fromISO) {
  const [Y,M,D] = fromISO.split('-').map(n => parseInt(n,10));
  const base = new Date(Date.UTC(Y, M-1, D, 12, 0, 0));
  if (keyword === 'today') return toISO(base);
  if (keyword === 'tomorrow') {
    base.setUTCDate(base.getUTCDate() + 1);
    return toISO(base);
  }
  return null;
}

/* ─────────── Recurrence parsing ─────────── */

function parseRecurrence(chunk) {
  const s = chunk.toLowerCase();

  if (/\bevery\s+other\s+day\b/.test(s)) {
    return { rrule: 'FREQ=DAILY;INTERVAL=2', label: 'every other day' };
  }

  const mN = s.match(/\bevery\s+(\d{1,2})\s+days?\b/);
  if (mN) {
    const interval = Math.max(1, Math.min(30, parseInt(mN[1], 10)));
    return { rrule: `FREQ=DAILY;INTERVAL=${interval}`, label: `every ${interval} days` };
  }

  if (/\b(every\s+day|daily)\b/.test(s)) {
    return { rrule: 'FREQ=DAILY;INTERVAL=1', label: 'every day' };
  }

  for (let i = 0; i < WEEKDAYS.length; i++) {
    const wd = WEEKDAYS[i];
    const abbrs = WEEKDAY_ABBR.filter(a => wd.startsWith(a) || a.startsWith(wd.slice(0,3)));
    const pat = new RegExp(`\\bevery\\s+(?:${wd}|${abbrs.join('|')})\\b`, 'i');
    if (pat.test(s)) {
      const byday = ['SU','MO','TU','WE','TH','FR','SA'][i];
      return { rrule: `FREQ=WEEKLY;BYDAY=${byday}`, label: `every ${wd}` };
    }
  }

  return null;
}

/* ─────────── Due date parsing ─────────── */

function parseDueDate(chunk, entryDateISO) {
  const iso = parseExplicitISO(chunk);
  if (iso) return iso;

  const rel = chunk.toLowerCase().match(/\b(today|tomorrow)\b/);
  if (rel) return relativeISO(rel[1], entryDateISO);

  const mNext = chunk.toLowerCase().match(
    /\bnext\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)\b/
  );
  if (mNext) {
    const wd = mNext[1];
    let idx = WEEKDAYS.indexOf(wd);
    if (idx === -1) {
      const core = wd.slice(0,3);
      idx = WEEKDAYS.findIndex(w => w.startsWith(core));
    }
    if (idx >= 0) return nextWeekdayISO(entryDateISO, idx);
  }

  const mBy = chunk.match(/\bby\s+(20\d{2}-\d{2}-\d{2})\b/i);
  if (mBy) return mBy[1];

  return null;
}

/* ─────────── Core extraction ─────────── */

export function extractTasks(text, entryDateISO) {
  if (!text || typeof text !== 'string') return [];

  const tasks = [];

  for (const pat of INTENT_PATTERNS) {
    let m;
    let idx = 0;
    while ((m = pat.exec(text.slice(idx))) !== null) {
      const hitStart = idx + m.index + m[0].length;
      const action = sliceAction(text, hitStart);
      idx = idx + m.index + m[0].length;
      if (!action) continue;

      const windowText = text.slice(idx - m[0].length, Math.min(text.length, idx + action.length + 40));
      const recurrence = parseRecurrence(windowText);
      const dueDate   = parseDueDate(windowText, entryDateISO);

      let conf = 0.7;
      if (/should/i.test(m[0])) conf = 0.55;
      if (/todo\s*:/i.test(m[0])) conf = 0.5;
      if (/^(the|my|our)\b/i.test(action)) conf -= 0.05;

      const kind = recurrence ? 'recurringTask' : (dueDate ? 'deadline' : 'suggestedTask');

      tasks.push({
        text: action,
        dueDate: dueDate || null,
        recurrence: recurrence ? recurrence.rrule : null,
        recurrenceLabel: recurrence ? recurrence.label : null,
        confidence: Math.max(0.1, Math.min(0.95, conf)),
        reason: kind
      });
    }
  }

  if (tasks.length === 0) {
    const lines = text.split(/\n+/).map(s => s.trim()).filter(Boolean);
    for (const line of lines) {
      if (/^[-*•]\s*(?:\[[ xX]\]\s*)?/i.test(line)) {
        const action = line.replace(/^[-*•]\s*(?:\[[ xX]\]\s*)?/i, '').trim();
        if (action && action.length > 2 && !BORING_SINGLE_WORDS.has(action.toLowerCase())) {
          tasks.push({
            text: action,
            dueDate: null,
            recurrence: null,
            recurrenceLabel: null,
            confidence: 0.5,
            reason: 'bullet'
          });
        }
      }
    }
  }

  const deduped = dedupeByKey(tasks, t => t.text.toLowerCase());
  deduped.sort((a, b) => b.confidence - a.confidence);
  return deduped.slice(0, MAX_SUGGESTIONS);
}

/* ─────────── Ripples wrapper ─────────── */

export function extractRipplesFromEntry({ text = '', entryDate = null, originalContext = null } = {}) {
  const entryDateISO = entryDate || toISO(new Date());
  const tasks = extractTasks(text, entryDateISO);

  const ripples = tasks.map(t => {
    const base = {
      entryDate: entryDateISO,
      extractedText: t.text,
      originalContext: originalContext || text,
      confidence: t.confidence,
      meta: {}
    };

    if (t.recurrence) {
      base.type = 'recurringTask';
      base.meta.recurrence = t.recurrence;
      base.meta.recurrenceLabel = t.recurrenceLabel;
    } else if (t.dueDate) {
      base.type = 'deadline';
      base.meta.dueDate = t.dueDate;
    } else {
      base.type = 'suggestedTask';
    }

    return base;
  });

  return { tasks, ripples };
}

/* ─────────── Back-compat named exports ─────────── */

// Old name in your codebase; returns the task suggestions array.
export function extractEntrySuggestions(text, entryDateISO = null) {
  const date = entryDateISO || toISO(new Date());
  return extractTasks(text, date);
}

// Old name in your codebase; returns only the ripples array.
export function extractRipples(text, entryDateISO = null, originalContext = null) {
  const { ripples } = extractRipplesFromEntry({
    text: text || '',
    entryDate: entryDateISO || null,
    originalContext: originalContext || text || ''
  });
  return ripples;
}

/* ─────────── Default export for convenience ─────────── */

export default {
  extractTasks,
  extractRipplesFromEntry,
  extractEntrySuggestions,
  extractRipples
};
