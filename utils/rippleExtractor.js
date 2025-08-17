// utils/rippleExtractor.js
// Multi-action ripple extraction with clause splitting, light typo fixes,
// recurrence parsing, and noise filtering. Designed for vibe entries.

/* ───────────────────────── Config */
const STOP_TOKENS = new Set([
  'day','week','month','year','daily','weekly','monthly','annually',
  'today','tomorrow','tonight','am','pm','someday','eventually'
]);

// Soft “not a task” vibes to ignore if no explicit action verb is present
const META_VIBES = /\b(it would be (super )?cool|sounds like|i (feel|think)|maybe|kinda|sorta|would|could)\b/i;

// Common lead-ins before a task
const LEADIN_RE = /\b(i\s+(really\s+)?(need|have|gotta|should|want)\s+to|remember\s+to|please\s+|we\s+should|let'?s)\b\s*/gi;

// Action verb hints (expandable)
const ACTION_HINTS = [
  'finish','fold','clean','wash','organize','buy','order','email','call',
  'schedule','book','apply','pay','renew','update','backup','ship','post',
  'sign','sign up','set up','print','scan','pack','unpack','write','send',
  'review','check','read','walk','cook','fix','learn','study','practice',
  'message','text','dm','ping','meet','prepare','draft','plan','refactor',
  'debug','deploy','commit','push','merge','design','edit','record',
  'submit','register','enroll','follow up','call back'
];

/* ───────────────────────── Helpers */

// Normalize tiny typos that break intent
function softFixes(s) {
  return String(s || '')
    // “singing up” → “signing up”
    .replace(/\bsinging up\b/gi, 'signing up')
    // gerund to imperative for “signing up” → “sign up”
    .replace(/\bsigning up\b/gi, 'sign up')
    // normalize “sign   up” spacing and “signup”
    .replace(/\bsign\s*up\b/gi, 'sign up')
    .replace(/\bsignup\b/gi, 'sign up')
    // duplicate “for volunteering volunteer” style noise
    .replace(/\b(sign up)\s+for\s+(volunteer(?:ing)?)\b/gi, '$1 for volunteering');
}

function hasActionVerb(s) {
  const t = String(s || '').toLowerCase();
  return ACTION_HINTS.some(v => t.includes(v));
}

// Cheap verb-ish detector for clause gating
function hasVerbLike(s) {
  const t = String(s || '').toLowerCase().trim();
  if (!t) return false;
  if (hasActionVerb(t)) return true;
  if (/^(finish|start|do|make|get|go|buy|pay|book|apply|clean|wash|write|send|call|email|text|message|schedule|organize|review|check|plan|draft|follow up)\b/.test(t)) return true;
  if (/^(sign\s*up|set\s*up)\b/.test(t)) return true;
  if (/^\w+ing\b/.test(t)) return true; // “folding laundry”, “booking dentist”
  return false;
}

/* ───────────────────────── Recurrence parsing */

function parseRecurrence(text) {
  const t = String(text || '').toLowerCase();

  if (/\bevery\s+other\s+day\b/.test(t)) return { unit: 'day', interval: 2 };
  const mEveryNDays = t.match(/\bevery\s+(\d+)\s+days?\b/);
  if (mEveryNDays) return { unit: 'day', interval: Math.max(1, parseInt(mEveryNDays[1], 10)) };
  if (/\b(every\s+day|daily)\b/.test(t)) return { unit: 'day', interval: 1 };

  if (/\bevery\s+other\s+week\b/.test(t)) return { unit: 'week', interval: 2 };
  const mEveryNWeeks = t.match(/\bevery\s+(\d+)\s+weeks?\b/);
  if (mEveryNWeeks) return { unit: 'week', interval: Math.max(1, parseInt(mEveryNWeeks[1], 10)) };
  if (/\b(every\s+week|weekly)\b/.test(t)) return { unit: 'week', interval: 1 };

  const WEEKDAYS = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
  const wd = WEEKDAYS.find(d => new RegExp(`\\b(every|on)\\s+${d}\\b`).test(t));
  if (wd) return { unit: 'week', interval: 1, byDay: [wd.slice(0,2).toUpperCase()] };

  if (/\bevery\s+other\s+month\b/.test(t)) return { unit: 'month', interval: 2 };
  const mEveryNMonths = t.match(/\bevery\s+(\d+)\s+months?\b/);
  if (mEveryNMonths) return { unit: 'month', interval: Math.max(1, parseInt(mEveryNMonths[1], 10)) };
  if (/\b(every\s+month|monthly)\b/.test(t)) return { unit: 'month', interval: 1 };

  return null;
}

function stripRecurrencePhrases(s) {
  return String(s || '')
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

/* ───────────────────────── Clause splitting (verb-aware) */

// First pass: split on hard sentence breaks and semicolons
const HARD_SPLIT = /[.!?]+|;+/g;

// Soft joiners we may split on if both sides look actionable
const SOFT_JOINERS = ['and then','then','and also','and','but','so','also','plus'];

// Try to split on soft joiners only when both sides look like actions
function smartSplitOnJoiners(text) {
  let parts = [text];
  for (const j of SOFT_JOINERS) {
    const next = [];
    for (const chunk of parts) {
      const re = new RegExp(`\\s+${j}\\s+`, 'i');
      if (!re.test(chunk)) { next.push(chunk); continue; }

      const tentative = chunk.split(re);
      if (tentative.length === 1) { next.push(chunk); continue; }

      // Re-stitch greedily while preserving action boundaries
      let buffer = tentative[0];
      for (let k = 1; k < tentative.length; k++) {
        const left  = String(buffer).trim();
        const right = String(tentative[k]).trim();
        const splitOkay = hasVerbLike(left) && hasVerbLike(right);
        if (splitOkay) {
          if (left) next.push(left);
          buffer = right;
        } else {
          buffer = `${buffer} ${j} ${right}`;
        }
      }
      if (String(buffer).trim()) next.push(String(buffer).trim());
    }
    parts = next;
  }
  return parts;
}

// Handle commas like “…, then …” or “…, and …” if the right side looks actionable
function maybeSplitOnComma(list) {
  const out = [];
  for (const s of list) {
    const m = String(s).split(/\s*,\s*/);
    if (m.length === 1) { out.push(s); continue; }
    let acc = m[0];
    for (let i = 1; i < m.length; i++) {
      const right = m[i];
      if (hasVerbLike(right)) {
        if (String(acc).trim()) out.push(String(acc).trim());
        acc = right;
      } else {
        acc = `${acc}, ${right}`;
      }
    }
    if (String(acc).trim()) out.push(String(acc).trim());
  }
  return out;
}

// Split text into actionable clauses with verb-aware logic
function splitClauses(text) {
  if (!text) return [];
  const sentences = String(text)
    .split(HARD_SPLIT)
    .map(s => s.trim())
    .filter(Boolean);

  const softSplit = sentences.flatMap(s => smartSplitOnJoiners(s));
  const commaAware = maybeSplitOnComma(softSplit);

  return commaAware
    .map(s => s.replace(/\s{2,}/g, ' ').trim())
    .filter(Boolean);
}

/* ───────────────────────── Cleaning */

function cleanPhrase(s) {
  let phrase = softFixes(String(s || ''))
    .replace(/\s+/g, ' ')
    .trim();

  phrase = stripRecurrencePhrases(phrase);
  phrase = phrase.replace(LEADIN_RE, '');

  // collapse “do that” back onto previous info if present
  phrase = phrase.replace(/\bdo that\b/gi, '').trim();

  // normalize starts like “finish to fold” → “finish folding”
  phrase = phrase.replace(/\bfinish to\b/gi, 'finish ').trim();

  // trim cruft
  phrase = phrase
    .replace(/\b(to|the|a|an)\s*$/i, '')
    .replace(/[.,;:!?]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  const words = phrase.split(/\s+/);
  if (words.length === 1 && STOP_TOKENS.has(words[0].toLowerCase())) return null;
  if (words.length < 2) return null;

  // Reject obvious meta-only lines unless they contain an action verb
  if (!hasActionVerb(phrase) && META_VIBES.test(phrase)) return null;

  // Small rewrites
  phrase = phrase
    .replace(/\bsign up for volunteering\b/gi, 'sign up for volunteering') // stable casing
    .replace(/\bfinish fold(?:ing)? the laundry\b/gi, 'finish folding the laundry');

  return phrase || null;
}

function normalizeKey(s) {
  return String(s || '')
    .toLowerCase()
    .replace(LEADIN_RE, '')
    .replace(/\b(to|the|a|an)\b/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/* ───────────────────────── Main */

export function extractRipples({ text, entryDate, userId, sourceEntryId }) {
  const out = [];
  const seen = new Set();

  const lines = String(text || '')
    .split(/\n+/)
    .map(s => s.trim())
    .filter(Boolean);

  for (const line of lines) {
    const clauses = splitClauses(line);

    for (const clause of clauses) {
      const recurrence = parseRecurrence(clause);
      const phrase = cleanPhrase(clause);
      if (!phrase) continue;

      const key = normalizeKey(phrase);
      if (!key || seen.has(key)) continue;
      seen.add(key);

      out.push({
        userId,
        sourceEntryId,
        entryDate,
        extractedText: phrase,
        originalContext: clause,
        type: 'suggestedTask',
        priority: 'low',
        contexts: [],
        status: 'pending',
        ...(recurrence ? { recurrence } : {})
      });
    }
  }

  return out;
}

// Legacy alias
export function extractEntrySuggestions(args) {
  return extractRipples(args);
}

