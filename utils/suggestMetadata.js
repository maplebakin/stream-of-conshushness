// ─────────────────────────────────────────────
//  suggestMetadata.js  —  refined August 2025
//  Conservative, thresholded extraction + chrono date parsing.
// ─────────────────────────────────────────────

import * as chrono from "chrono-node";

/* ---------------- mini utils ---------------- */
const toStr = (v) => (typeof v === 'string' ? v : String(v ?? ''));
const stripHTML = (s = '') => toStr(s).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const lower = (s) => toStr(s).toLowerCase();
const uniq = (arr) => [...new Set(arr)];
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const tokens = (s) => lower(stripHTML(s)).match(/[a-z0-9#@]+(?:'[a-z]+)?/g) || [];
const includesWord = (s, w) => new RegExp(`\\b${w}\\b`, 'i').test(s);

// date/time helpers
const ymd = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};
const hhmm = (d) => `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;

/* ---------------- lexicons ---------------- */
// Keep these small + targeted to avoid overfiring.
// You can grow them later per domain.

const MOOD_POS = [
  'calm','content','grateful','excited','hopeful','energized','validated','aligned','proud'
];
const MOOD_NEG = [
  'tired','drained','overwhelmed','stressed','anxious','angry','sad','frustrated','dysregulated'
];

// ND/metaphysical terms (context only)
const ND_TERMS = ['adhd','autistic','aspergers','sensory','stimming','executive dysfunction'];
const META_TERMS = ['tarot','manifest','ritual','sigil','chakra','astro','astrology','oracle','synchronicity'];

// Clusters: map cluster name -> indicative keywords
const CLUSTER_HINTS = {
  home      : ['clean','laundry','dishes','trash','kitchen','apartment','declutter','reset'],
  colton    : ['colton','school','jk','kid','child','bedtime','morning routine','lunch','pickup'],
  work      : ['resume','interview','client','deploy','merge','repo','ticket','sprint'],
  health    : ['meds','medication','effexor','vyvanse','doctor','dentist','exercise','gym','sleep'],
  finance   : ['budget','rent','bill','invoice','payment','subscription'],
  games     : ['steam','switch','stardew','palworld','spirittea','game','quest','level'],
  crochet   : ['crochet','pattern','yarn','hook','gauge','rows','stitch'],
  spiritual : ['tarot','altar','ritual','meditate','manifest','sigil','oracle']
};

// Tags: map tag -> strong keyword cues (lowercase)
// (Weak/implicit tags are not auto-added; keep this explicit.)
const TAG_HINTS = {
  priority   : ['priority'],
  focus      : ['focus','deep work','no distractions'],
  routine    : ['routine','daily','weekly','schedule'],
  gratitude  : ['grateful','appreciate','thankful'],
  idea       : ['idea','brainwave','concept','pitch'],
  bug        : ['bug','error','stacktrace','exception'],
};

/* Priority/time lexicons for helper analyzers */
const PRIORITY_HIGH = ['urgent','asap','critical','important','emergency','immediately','now'];
const PRIORITY_MED  = ['should','need to','must','priority','todo','task'];
const MAYBE_WORDS   = ['maybe','might','possibly','someday'];

const TIME_IMMEDIATE = ['today','now','asap','immediately','right away','tonight','this morning','this afternoon','this evening'];
const TIME_SOON      = ['tomorrow','soon','this week','by friday','by monday','over the weekend'];
const TIME_LATER     = ['next week','next month','eventually','someday','later'];

/* ---------------- exports: analyzers used elsewhere ---------------- */
export function analyzeMood(text = '') {
  const t = lower(stripHTML(text));
  const found = new Set();
  for (const w of MOOD_POS) if (includesWord(t, w)) found.add(w);
  for (const w of MOOD_NEG) if (includesWord(t, w)) found.add(w);

  // light emoji check (not exhaustive)
  if (/[🙂😊😌😍✨]/.test(text)) found.add('positive');
  if (/[😞😡😭😫😤]/.test(text)) found.add('negative');

  // valence/intensity crude scoring
  let pos = 0, neg = 0;
  for (const w of MOOD_POS) if (includesWord(t, w)) pos++;
  for (const w of MOOD_NEG) if (includesWord(t, w)) neg++;
  const valence = pos === neg ? 0 : (pos > neg ? 1 : -1);
  const intensity = Math.min(3, pos + neg); // 0..3 rough

  return {
    moods: [...found],
    valence,
    intensity
  };
}

export function analyzePriority(text = '') {
  const t = lower(stripHTML(text));
  if (PRIORITY_HIGH.some(w => includesWord(t, w))) return 'high';
  if (PRIORITY_MED.some(w => includesWord(t, w)))  return 'medium';
  return 'low';
}

export function analyzeContext(content = '') {
  const t = lower(stripHTML(content));

  const neurodivergentMarkers = ND_TERMS.filter(w => includesWord(t, w));
  const metaphysicalElements  = META_TERMS.filter(w => includesWord(t, w));

  const processingStyle = [];
  if (includesWord(t, 'visual'))  processingStyle.push('visual');
  if (includesWord(t, 'auditory')) processingStyle.push('auditory');

  const communicationStyle = [];
  if (includesWord(t, 'script')) communicationStyle.push('scripted');
  if (includesWord(t, 'unscripted')) communicationStyle.push('unscripted');

  const energyLevel = [];
  if (includesWord(t, 'exhausted') || includesWord(t, 'drained')) energyLevel.push('low');
  if (includesWord(t, 'energized') || includesWord(t, 'hyped'))   energyLevel.push('high');

  return {
    neurodivergentMarkers,
    metaphysicalElements,
    processingStyle,
    communicationStyle,
    energyLevel
  };
}

export function analyzeTimeSensitivity(text = '') {
  const t = lower(stripHTML(text));
  if (TIME_IMMEDIATE.some(w => includesWord(t, w))) return 'immediate';
  if (TIME_SOON.some(w => includesWord(t, w)))      return 'short_term';
  if (TIME_LATER.some(w => includesWord(t, w)))     return 'long_term';
  return 'unspecified';
}

// Confidence used by regex-based ripple hits
export function calculateConfidence(match, type) {
  let base = 0.45;
  const s = toStr(match?.[0] ?? '').toLowerCase();

  if (PRIORITY_HIGH.some(w => s.includes(w))) base += 0.25;
  if (PRIORITY_MED.some(w => s.includes(w)))  base += 0.1;
  if (MAYBE_WORDS.some(w => s.includes(w)))   base -= 0.15;

  const captured = toStr(match?.[1] ?? '').trim();
  if (captured.length > 20) base += 0.08;
  if (captured && captured.length < 5) base -= 0.15;

  // task-like types get a small boost
  if (['urgentTask','suggestedTask','procrastinatedTask','recurringTask','deadline'].includes(type)) base += 0.05;

  return clamp01(base);
}

/* ---------------- local helpers ---------------- */
function gatherHashtags(text) {
  const m = toStr(text).match(/(^|\s)#([a-z0-9_-]{2,30})\b/gi) || [];
  return m.map(s => s.replace(/^.*#/, '').toLowerCase());
}

function gatherBracketTags(text) {
  // [tag] or {tag} are treated as intentional metadata
  const out = [];
  const re = /[\[\{]([a-z0-9 _-]{2,30})[\]\}]/gi;
  let m;
  while ((m = re.exec(text))) {
    out.push(m[1].trim().toLowerCase().replace(/\s+/g, '-'));
  }
  return out;
}

function guessTagsFromKeywords(text) {
  const t = lower(stripHTML(text));
  const hits = [];
  Object.entries(TAG_HINTS).forEach(([tag, keys]) => {
    if (keys.some(k => includesWord(t, k))) hits.push(tag);
  });
  return hits;
}

function guessClusters(text) {
  const t = lower(stripHTML(text));
  const hits = [];
  Object.entries(CLUSTER_HINTS).forEach(([cluster, keys]) => {
    // require at least 2 distinct hits to avoid overfiring (except exact name)
    const count = keys.reduce((acc, k) => acc + (includesWord(t, k) ? 1 : 0), 0);
    if (includesWord(t, cluster) || count >= 2) hits.push(cluster);
  });
  return hits;
}

/* ---------------- chrono integration ---------------- */
/**
 * extractWhen(text, baseDate)
 * Returns array of { title, date, timeStart? } using chrono-node.
 * We derive "title" as the text before the date phrase; fallback to whole text if needed.
 */
function extractWhen(text, baseDate = new Date()) {
  const clean = stripHTML(toStr(text));
  const parsed = chrono.parse(clean, baseDate);
  if (!parsed.length) return [];

  const out = [];
  for (const p of parsed) {
    const start = p.start?.date?.();
    if (!start) continue;
    const title = (clean.slice(0, p.index).trim() || clean.trim()).replace(/\s+/g, " ");
    const item = { title, date: ymd(start) };
    const hour = p.start.get("hour");
    if (typeof hour === "number") item.timeStart = hhmm(start);
    out.push(item);
  }

  // de-dup by title|date
  const uniqMap = new Map();
  for (const ev of out) {
    const key = `${ev.title.toLowerCase()}|${ev.date}`;
    if (!uniqMap.has(key)) uniqMap.set(key, ev);
  }
  return [...uniqMap.values()];
}

/* ---------------- default export ---------------- */
/**
 * suggestMetadata(content, baseDate?) ->
 *   {
 *     tags: string[],
 *     moods: string[],
 *     clusters: string[],
 *     context: object | null,
 *     confidence: number,         // 0..1
 *     timeSensitivity: 'immediate'|'short_term'|'long_term'|'unspecified',
 *     when: Array<{ title, date, timeStart? }>
 *   }
 */
export default function suggestMetadata(content, baseDate = new Date()) {
  const raw = toStr(content);
  if (!raw.trim()) {
    return {
      tags: [],
      moods: [],
      clusters: [],
      context: null,
      confidence: 0,
      timeSensitivity: 'unspecified',
      when: []
    };
  }

  const clean = stripHTML(raw);
  const tok = tokens(clean);
  const textLC = lower(clean);

  // 1) Tags: explicit >> implicit; cap to avoid spam
  const tagsExplicit = [...gatherHashtags(raw), ...gatherBracketTags(raw)];
  const tagsImplicit = guessTagsFromKeywords(clean);
  const tags = uniq([...tagsExplicit, ...tagsImplicit]).slice(0, 10);

  // 2) Moods (strings)
  const moodInfo = analyzeMood(clean);
  const moods = uniq(moodInfo.moods).slice(0, 6);

  // 3) Clusters (strings), conservative
  const clusters = uniq(guessClusters(clean)).slice(0, 4);

  // 4) Context object
  const context = analyzeContext(clean);

  // 5) Time sensitivity (your existing lexicon heuristic)
  const timeSensitivity = analyzeTimeSensitivity(clean);

  // 6) Chrono-driven "when" candidates
  const when = extractWhen(clean, baseDate);

  // 7) Overall confidence (soft heuristic)
  let conf = 0;
  if (tagsExplicit.length) conf += 0.3;
  if (moods.length)        conf += 0.2;
  if (clusters.length)     conf += 0.25;

  // urgency bumps
  if (PRIORITY_HIGH.some(w => includesWord(textLC, w))) conf += 0.15;
  if (PRIORITY_MED.some(w => includesWord(textLC, w)))  conf += 0.05;

  // hedge if everything is super short/vague
  if (clean.split(/\s+/).length < 4) conf = Math.min(conf, 0.35);

  const confidence = clamp01(conf);

  return { tags, moods, clusters, context, confidence, timeSensitivity, when };
}
