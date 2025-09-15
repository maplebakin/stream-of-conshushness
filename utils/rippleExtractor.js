// utils/rippleExtractor.js
// Ultra-calm task/ripple extraction with strong-intent gating.
// Fires only on: need to / have to / must / don't forget to / remind me to / line-start "TODO:"
// Optional dial: REQUIRE_DUE_OR_RECURRENCE to only accept dated/recurring items.

const WEEKDAYS = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
const WEEKDAY_ABBR = ['sun','mon','tue','tues','wed','thu','thur','thurs','fri','sat'];

const MAX_SUGGESTIONS = 3;
const BORING_SINGLE_WORDS = new Set(['day','today','tomorrow','sometime','later','soon','now','please']);

// ——— enthusiasm dials ———
const REQUIRE_STRONG_INTENT = true;          // keep this true for calm behavior
const REQUIRE_DUE_OR_RECURRENCE = false;     // set true to be monk-level strict

const INTENT_PATS = [
  /\b(?:i|we)\s+(?:need|have)\s+to\s+/i,
  /\b(?:i|we)\s+must\s+/i,
  /\bdon['’]t\s+forget\s+to\s+/i,
  /\bremind\s+me\s+to\s+/i,
  /(?:^|\n)\s*todo\s*:\s*/i
];

const HYPOS = [
  'should','maybe','might','could','if ','if i','if we','wonder if','thinking about','considering','someday','hopefully'
];

const NEGATIONS = ["don't",'do not',"won't",'will not',"can't",'cannot',"shouldn't",'never',' not '];

const ACTION_VERBS = [
  'buy','call','email','text','message',
  'schedule','book','attend',
  'clean','wash','wipe','vacuum','mop','water','feed',
  'pay','renew','submit','file','send','print','scan',
  'write','read','finish','fix','update','check','review',
  'install','uninstall','replace',
  'pick up','drop off','prepare','plan','organize','record','practice','backup','back up'
];

function escapeRegex(s){return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}

function toISO(date) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric', month: '2-digit', day: '2-digit'
  });
  const parts = fmt.formatToParts(date);
  const y = parts.find(p=>p.type==='year').value;
  const m = parts.find(p=>p.type==='month').value;
  const d = parts.find(p=>p.type==='day').value;
  return `${y}-${m}-${d}`;
}

function parseExplicitISO(s){const m=s.match(/\b(20\d{2})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b/);return m?m[0]:null;}
function nextWeekdayISO(fromISO, targetDow){
  const [Y,M,D]=fromISO.split('-').map(n=>parseInt(n,10));
  const d=new Date(Date.UTC(Y,M-1,D,12)); const dow=d.getUTCDay();
  const delta=(targetDow-dow+7)%7||7; d.setUTCDate(d.getUTCDate()+delta); return toISO(d);
}
function relativeISO(keyword, fromISO){
  const [Y,M,D]=fromISO.split('-').map(n=>parseInt(n,10));
  const b=new Date(Date.UTC(Y,M-1,D,12));
  if(keyword==='today') return toISO(b);
  if(keyword==='tomorrow'){b.setUTCDate(b.getUTCDate()+1); return toISO(b);}
  return null;
}

// ——— recurrence (strict) ———
function parseRecurrence(s){
  const low=s.toLowerCase();

  const other=low.match(/\bevery\s+other\s+day\b/);
  if(other) return { rrule:'FREQ=DAILY;INTERVAL=2', label:'every other day' };

  const everyN=low.match(/\bevery\s+(\d{1,2})\s+days?\b/);
  if(everyN){const n=Math.max(1,Math.min(30,parseInt(everyN[1],10))); return { rrule:`FREQ=DAILY;INTERVAL=${n}`, label:`every ${n} days` };}

  if(/\b(every\s+day|daily)\b/.test(low)) return { rrule:'FREQ=DAILY;INTERVAL=1', label:'every day' };

  for(let i=0;i<WEEKDAYS.length;i++){
    const wd=WEEKDAYS[i];
    const ab=WEEKDAY_ABBR.filter(a=>wd.startsWith(a)||a.startsWith(wd.slice(0,3)));
    const pat=new RegExp(`\\bevery\\s+(?:${wd}|${ab.join('|')})\\b`,'i');
    if(pat.test(low)){ const by=['SU','MO','TU','WE','TH','FR','SA'][i]; return { rrule:`FREQ=WEEKLY;BYDAY=${by}`, label:`every ${wd}` }; }
  }
  return null;
}

// ——— due date (strict) ———
function parseDueDate(s, entryDateISO){
  const iso=parseExplicitISO(s); if(iso) return iso;
  const rel=s.toLowerCase().match(/\b(today|tomorrow)\b/); if(rel) return relativeISO(rel[1],entryDateISO);
  const mNext=s.toLowerCase().match(/\bnext\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)\b/);
  if(mNext){let wd=mNext[1]; let idx=WEEKDAYS.indexOf(wd); if(idx===-1){const core=wd.slice(0,3); idx=WEEKDAYS.findIndex(w=>w.startsWith(core));} if(idx>=0) return nextWeekdayISO(entryDateISO,idx);}
  const by=s.match(/\bby\s+(20\d{2}-\d{2}-\d{2})\b/i); if(by) return by[1];
  return null;
}

// ——— text gating ———
function containsHypo(s){const low=s.toLowerCase();return HYPOS.some(h=>low.includes(h));}
function hasNegationWindow(action, prefix){const hay=`${prefix} ${action}`.toLowerCase();return NEGATIONS.some(n=>hay.includes(n));}
function hasActionVerb(action){
  const low=action.toLowerCase();
  for(const v of ACTION_VERBS.filter(v=>v.includes(' '))){if(new RegExp(`\\b${escapeRegex(v)}\\b`,'i').test(low)) return true;}
  for(const v of ACTION_VERBS.filter(v=>!v.includes(' '))){if(new RegExp(`\\b${escapeRegex(v)}(e|ed|es|ing)?\\b`,'i').test(low)) return true;}
  return false;
}

// ——— action slicing ———
function sliceAction(fullText,startIdx){
  const tail=fullText.slice(startIdx);
  const boundary=tail.search(/(?=\.|\?|!|$)|(?=,)|(?=\s+\band\b)|(?=\s+\bthen\b)|(?=\s+\bbecause\b)|(?=\s+\bsince\b)/i);
  const raw=boundary===-1?tail:tail.slice(0,boundary);
  let action=raw.replace(/^\s*(to\s+)?/i,'').replace(/\s+(?:please|now|soon|later)\s*$/i,'').replace(/\s+/g,' ').trim();
  if(!action||action.length<3) return null;
  if(!/\w/.test(action)) return null;
  if(!/\s/.test(action) && BORING_SINGLE_WORDS.has(action.toLowerCase())) return null;
  return action;
}

function dedupeByKey(items, keyFn){const seen=new Set();const out=[];for(const it of items){const k=keyFn(it);if(seen.has(k)) continue;seen.add(k);out.push(it);}return out;}

// ——— core ———
export function extractTasks(text, entryDateISO) {
  if (!text || typeof text !== 'string') return [];
  const date = entryDateISO || toISO(new Date());
  const tasks = [];

  for (const pat of INTENT_PATS) {
    let idx = 0, m;
    while ((m = pat.exec(text.slice(idx))) !== null) {
      const hitStart = idx + m.index;
      const after = hitStart + m[0].length;
      const action = sliceAction(text, after);
      idx = after;
      if (!action) continue;

      const prefix = text.slice(Math.max(0, hitStart - 40), hitStart);

      if (REQUIRE_STRONG_INTENT && !m[0]) continue;                 // defensive
      if (containsHypo(`${prefix} ${action}`)) continue;            // maybe/if/etc
      if (hasNegationWindow(action, prefix)) continue;              // don't call ...
      if (!hasActionVerb(action)) continue;                         // must have real verb

      const recurrence = parseRecurrence(action) || parseRecurrence(prefix);
      const dueDate = parseDueDate(action, date) || parseDueDate(prefix, date);

      if (REQUIRE_DUE_OR_RECURRENCE && !(recurrence || dueDate)) continue;

      let conf = /\bmust\b/i.test(m[0]) ? 0.9 : /\b(?:need|have)\s+to\b/i.test(m[0]) ? 0.8 : 0.6;
      if (/todo\s*:/i.test(m[0])) conf = Math.min(conf, 0.6);

      tasks.push({
        text: action,
        dueDate: dueDate || null,
        recurrence: recurrence ? recurrence.rrule : null,
        recurrenceLabel: recurrence ? recurrence.label : null,
        confidence: Math.max(0.1, Math.min(0.95, conf)),
        reason: recurrence ? 'recurringTask' : (dueDate ? 'deadline' : 'suggestedTask')
      });
    }
  }

  const deduped = dedupeByKey(tasks, t => t.text.toLowerCase());
  deduped.sort((a,b)=>b.confidence-a.confidence);
  return deduped.slice(0, MAX_SUGGESTIONS);
}

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
    if (t.recurrence) { base.type='recurringTask'; base.meta.recurrence=t.recurrence; base.meta.recurrenceLabel=t.recurrenceLabel; }
    else if (t.dueDate) { base.type='deadline'; base.meta.dueDate=t.dueDate; }
    else { base.type='suggestedTask'; }
    return base;
  });
  return { tasks, ripples };
}

// back-compat shims
export function extractEntrySuggestions(text, entryDateISO = null){const d=entryDateISO||toISO(new Date());return extractTasks(text,d);}
export function extractRipples(text, entryDateISO = null, originalContext = null){
  const { ripples } = extractRipplesFromEntry({ text: text || '', entryDate: entryDateISO || null, originalContext: originalContext || text || '' });
  return ripples;
}

export default { extractTasks, extractRipplesFromEntry, extractEntrySuggestions, extractRipples };
