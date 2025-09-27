// utils/rippleSieve.js
// Rejects vague chatter. Allows only clearly actionable text with a real verb.

import ACTION_VERBS from './rippleVerbs.js';

const BORING_SINGLE_WORDS = new Set(['day','today','tomorrow','sometime','later','soon','now','please']);

const FILLER = [
  /\bidk\b/i, /\bsomething\b/i, /\blet['’]s see\b/i, /\bthat'?s at least\b/i,
  /\bwell(,|\s)/i, /\byeah\b/i, /\bdramatique\b/i, /\bsemi-?functional\b/i,
  /^\s*(hmm+|uh+|erm)\b/i
];

function escapeRegex(s){return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}

function hasActionVerb(text){
  const s=String(text||'').toLowerCase();
  for(const v of ACTION_VERBS.filter(v=>v.includes(' '))){ if(new RegExp(`\\b${escapeRegex(v)}\\b`,'i').test(s)) return true; }
  for(const v of ACTION_VERBS.filter(v=>!v.includes(' '))){ if(new RegExp(`\\b${escapeRegex(v)}(e|ed|es|ing)?\\b`,'i').test(s)) return true; }
  return false;
}

function looksLikeJunk(text){
  const s=String(text||'').trim();
  if(!s) return true;
  if(!/\s/.test(s) && BORING_SINGLE_WORDS.has(s.toLowerCase())) return true;
  if(s.length<6) return true;
  if(FILLER.some(p=>p.test(s))) return true;
  const letters=(s.match(/[A-Za-z\u00C0-\u024F]/g)||[]).length;
  const punct=(s.match(/[.,!?…]/g)||[]).length;
  if(letters<8 || punct>letters/2) return true;
  return false;
}

export function isActiony(text){ if(looksLikeJunk(text)) return false; return hasActionVerb(text); }

export function sieveRipples(ripples=[]){
  return (ripples||[]).filter(r => isActiony(r.extractedText || r.text));
}

export function whyReject(text){
  if(looksLikeJunk(text)) return 'junk';
  if(!hasActionVerb(text)) return 'no-verb';
  return 'ok';
}

export default { sieveRipples, isActiony, whyReject };
