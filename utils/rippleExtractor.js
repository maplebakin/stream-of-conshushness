// utils/rippleExtractor.js
// Lightweight ripple extraction tuned for Stream-of-Conshushness.
// Pull a single, clean task phrase + optional recurrence.
// Avoid noisy tokens like "day" and duplicates.

const STOP_TOKENS = new Set([
  'day','week','month','year','daily','weekly','monthly','annually','other',
  'today','tomorrow','tonight','am','pm'
]);

// Strip common lead-ins before extracting the task phrase.
const LEADIN_RE = /\b(i\s+need\s+to|i\s*have\s*to|i\s*should|remember\s+to|gotta|need\s+to|must|please\s+|we\s+should|let'?s)\b\s*/gi;

// Recurrence parsers → { unit:'day'|'week'|'month', interval:number, byDay?:string[] }
function parseRecurrence(text) {
  const t = text.toLowerCase();

  // every other day
  if (/\bevery\s+other\s+day\b/.test(t)) return { unit: 'day', interval: 2 };
  // every N days
  const mEveryNDays = t.match(/\bevery\s+(\d+)\s+days?\b/);
  if (mEveryNDays) return { unit: 'day', interval: Math.max(1, parseInt(mEveryNDays[1], 10)) };
  // every day / daily
  if (/\b(every\s+day|daily)\b/.test(t)) return { unit: 'day', interval: 1 };

  // weekly
  if (/\bevery\s+other\s+week\b/.test(t)) return { unit: 'week', interval: 2 };
  const mEveryNWeeks = t.match(/\bevery\s+(\d+)\s+weeks?\b/);
  if (mEveryNWeeks) return { unit: 'week', interval: Math.max(1, parseInt(mEveryNWeeks[1], 10)) };
  if (/\b(every\s+week|weekly)\b/.test(t)) return { unit: 'week', interval: 1 };

  // weekdays like "every monday" or "on monday"
  const WEEKDAYS = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
  const wd = WEEKDAYS.find(d => new RegExp(`\\b(every|on)\\s+${d}\\b`).test(t));
  if (wd) return { unit: 'week', interval: 1, byDay: [wd.toUpperCase().slice(0,2)] }; // MO, TU, ...

  // monthly
  if (/\bevery\s+other\s+month\b/.test(t)) return { unit: 'month', interval: 2 };
  const mEveryNMonths = t.match(/\bevery\s+(\d+)\s+months?\b/);
  if (mEveryNMonths) return { unit: 'month', interval: Math.max(1, parseInt(mEveryNMonths[1], 10)) };
  if (/\b(every\s+month|monthly)\b/.test(t)) return { unit: 'month', interval: 1 };

  return null;
}

// Remove explicit recurrence phrases so the task title stays clean.
function stripRecurrencePhrases(s) {
  return s
    .replace(/\bevery\s+other\s+day\b/gi, '')
    .replace(/\bevery\s+\d+\s+days?\b/gi, '')
    .replace(/\b(every\s+day|daily)\b/gi, '')
    .replace(/\bevery\s+other\s+week\b/gi, '')
    .replace(/\bevery\s+\d+\s+weeks?\b/gi, '')
    .replace(/\b(every\s+week|weekly)\b/gi, '')
    .replace(/\b(every|on)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi, '')
    .replace(/\bevery\s+other\s+month\b/gi, '')
    .replace(/\bevery\s+\d+\s+months?\b/gi, '')
    .replace(/\b(every\s+month|monthly)\b/gi, '');
}

// Try to extract a verb phrase like "clean the fish tank"
function extractVerbPhrase(text) {
  const VERBS = [
    'clean','wash','water','feed','change','vacuum','mop','sweep','take','empty','replace',
    'call','email','text','message','pay','buy','order','get','send','schedule','book',
    'write','read','practice','exercise','trash','check','renew','update','post','backup',
    'plan','cook','bake','shop','charge','pack','organize','sort','review','file'
  ];
  const re = new RegExp(`\\b(${VERBS.join('|')})\\b([^\\.\\n;:]*)`, 'i');
  const m = text.match(re);
  if (!m) return null;

  // Construct "verb + object", then clean it
  let phrase = `${m[1]}${m[2] || ''}`;

  // Strip recurrence and lead-ins
  phrase = stripRecurrencePhrases(phrase);
  phrase = phrase.replace(LEADIN_RE, '');

  // Trim punctuation and extra words at ends
  phrase = phrase
    .replace(/\b(to|the|a|an)\s*$/i, '')   // trailing articles
    .replace(/[.,;:!?]+$/g, '')            // trailing punctuation
    .replace(/\s{2,}/g, ' ')
    .trim();

  // Avoid single-word junk (e.g., just "day")
  const words = phrase.split(/\s+/);
  if (words.length < 2) return null;
  if (words.length === 1 && STOP_TOKENS.has(words[0].toLowerCase())) return null;

  return phrase;
}

function normalizeTitleKey(s) {
  return s
    .toLowerCase()
    .replace(LEADIN_RE, '')
    .replace(/\b(to|the|a|an)\b/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * extractRipples
 * @param {Object} params
 * @param {string} params.text - raw entry text
 * @param {string} params.entryDate - 'YYYY-MM-DD'
 * @param {string} [params.userId]
 * @param {string} [params.sourceEntryId]
 * @returns {Array<Object>} ripple drafts ready to insert
 */
export function extractRipples({ text = '', entryDate, userId, sourceEntryId }) {
  const original = String(text || '').trim();
  if (!original) return [];

  // Normalize once for parsing
  let working = original.replace(LEADIN_RE, ''); // remove "I need to", etc.

  const recurrence = parseRecurrence(working);
  const phrase = extractVerbPhrase(working);

  const out = [];
  const seen = new Set();

  if (phrase) {
    const key = normalizeTitleKey(phrase);
    if (key && !seen.has(key) && !STOP_TOKENS.has(key)) {
      seen.add(key);
      const ripple = {
        userId,
        sourceEntryId,
        entryDate,
        extractedText: phrase,            // e.g., "clean the fish tank"
        originalContext: original,
        type: recurrence ? 'recurringTask' : 'suggestedTask',
        priority: 'low'
      };
      if (recurrence) ripple.recurrence = recurrence;
      // For recurring, use entryDate as the start unless caller sets something else
      ripple.dueDate = entryDate || null;
      out.push(ripple);
    }
  }

  return out;
}

// ── Compatibility alias for older callers ────────────────────────────
// Some code imports { extractEntrySuggestions } from this module.
// Keep it as an alias to extractRipples to avoid breaking changes.
export function extractEntrySuggestions(args) {
  return extractRipples(args);
}

// Default export for convenience in CommonJS interop patterns
export default { extractRipples, extractEntrySuggestions };
