// utils/analyzeEntry.js
// Centralized analyzer for new/edited entries.
// Uses suggestMetadata (which includes chrono-node parsing) to derive
// tags, moods, clusters, context, timeSensitivity, and date/time "when".
// Returns ImportantEvent candidates (date only) and Appointment candidates (date+time).

import suggestMetadata from "./suggestMetadata.js";

/* local helpers */
const stripHtml = (s) =>
  String(s || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

const uniq = (arr) => [...new Set(arr)];

/** very small keyword tagger to keep your legacy behavior */
function quickTags(s) {
  const out = new Set();
  const t = String(s || "").toLowerCase();
  if (/\bschool\b/.test(t)) out.add("school");
  if (/\bdoctor|dentist|clinic|appointment\b/.test(t)) out.add("appointment");
  if (/\bbirthday\b/.test(t)) out.add("birthday");
  return Array.from(out);
}

const TASK_ACTION_VERBS = [
  'pay',
  'clean',
  'tidy',
  'finish',
  'extend',
  'renew',
  'submit',
  'call',
  'email',
  'book',
  'schedule',
  'register',
  'sign up',
  'buy',
  'order',
  'pick up',
];

const DEADLINE_WORDS = /\b(?:today|tomorrow|tonight|by\s+the\s+end\s+of\s+the\s+day|by\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|in\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+months?)\b/i;

function isActionDeadlinePhrase(text = '') {
  const source = String(text || '').toLowerCase();
  if (!source) return false;
  if (!DEADLINE_WORDS.test(source)) return false;
  return TASK_ACTION_VERBS.some((verb) => {
    const escaped = verb.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    return new RegExp(`\\b${escaped}\\b`, 'i').test(source);
  });
}

/**
 * analyzeEntry({ text, html, baseDate }) ->
 * {
 *   tags: string[],
 *   moods: string[],
 *   clusters: string[],
 *   context: object|null,
 *   timeSensitivity: 'immediate'|'short_term'|'long_term'|'unspecified',
 *   confidence: number,      // 0..1
 *   importantEvents: [{ title, date }],
 *   appointments: [{ title, date, timeStart }]
 * }
 */
export function analyzeEntry({ text = "", html = "", baseDate = new Date() } = {}) {
  const content = (text || "").trim() || stripHtml(html || "");

  // Pull full metadata (uses chrono inside suggestMetadata)
  const md = suggestMetadata(content, baseDate);

  // Keep your old lightweight tags but merge with md.tags
  const tags = uniq([...(md.tags || []), ...quickTags(content)]).slice(0, 12);

  // Split chrono results into event vs appointment candidates
  const when = Array.isArray(md.when) ? md.when : [];
  const importantEvents = [];
  const appointments = [];
  for (const w of when) {
    if (!w) continue;
    const { title, date, timeStart } = w;
    if (!title || !date) continue;
    if (timeStart) {
      appointments.push({ title, date, timeStart });
    } else if (!isActionDeadlinePhrase(content)) {
      importantEvents.push({ title, date });
    }
  }

  return {
    tags,
    moods: md.moods || [],
    clusters: md.clusters || [],
    context: md.context ?? null,
    timeSensitivity: md.timeSensitivity || "unspecified",
    confidence: typeof md.confidence === "number" ? md.confidence : 0,
    importantEvents,
    appointments,
  };
}

export default analyzeEntry;
