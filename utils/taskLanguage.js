// utils/taskLanguage.js
// Heuristics to detect clusters from phrases like "for Colton", "in Home", "#work", "[games]".
const KNOWN = ['home','work','colton','games','crochet','spiritual','health','finance'];

const toStr = (v)=> (typeof v==='string'? v : String(v??''));
const lower = (s)=> toStr(s).toLowerCase();

export function extractAssignedClusters(text, knownClusters = KNOWN) {
  const src = toStr(text);
  const t   = lower(src);

  const out = new Set();

  // 1) Hashtags and bracketed tags are explicit
  for (const m of src.matchAll(/(^|\s)#([a-z0-9_-]{2,30})\b/gi)) out.add(m[2].toLowerCase());
  for (const m of src.matchAll(/[\[\{]([a-z0-9 _-]{2,30})[\]\}]/gi)) out.add(m[1].trim().toLowerCase().replace(/\s+/g,'-'));

  // 2) Preposition cues: "for|in|re:" + known cluster names
  for (const c of knownClusters) {
    const rx = new RegExp(`\\b(?:for|in|re:|re\\s*->|about)\\s+${c}\\b`, 'i');
    if (rx.test(src)) out.add(c.toLowerCase());
  }

  // 3) Emoji-ish cues (home/work quick wins)
  if (/[🏠🧹🧺]/.test(src)) out.add('home');
  if (/[💼🧑‍💻]/.test(src)) out.add('work');
  if (/\bcolton\b/i.test(src)) out.add('colton');

  // 4) Lightweight keyword counts (avoid overfiring; require 2 hits)
  const HINTS = {
    home:['laundry','dishes','kitchen','declutter','trash','clean'],
    work:['client','deploy','merge','ticket','resume','interview'],
    health:['meds','doctor','dentist','exercise','gym','sleep','medication'],
    finance:['budget','rent','bill','invoice','payment'],
    games:['steam','switch','game','quest','level'],
    crochet:['crochet','yarn','stitch','pattern','hook']
  };
  for (const [cluster, words] of Object.entries(HINTS)) {
    const hits = words.reduce((n,w)=> n + (new RegExp(`\\b${w}\\b`,'i').test(src) ? 1 : 0), 0);
    if (hits >= 2) out.add(cluster);
  }

  return [...out]; // lowercase simple ids (your UI can pretty-case them)
}
export default extractAssignedClusters;
