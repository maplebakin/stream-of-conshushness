const MAX_SUGGESTIONS = 5;

const LISTS = {
  containers: 'Needed Containers',
  buy: 'Things to Buy',
  replace: 'Things to Replace',
  craft: 'Craft Supplies',
  colton: 'Colton Needs',
  home: 'Home Supplies',
  grocery: 'Grocery List',
  pet: 'Pet Supplies',
};

const NEED_PATTERNS = [
  /\b(?:i|we)\s+need\s+to\s+(?:get|buy|grab|pick\s+up|purchase)\s+([^.!?\n]+)/gi,
  /\b(?:i|we)\s+need\s+(?:get|buy|grab|pick\s+up|purchase)\s+([^.!?\n]+)/gi,
  /\b(?:i|we)\s+need\s+(?:(?:a|an|some|the)\b\s*)?([^.!?\n]+)/gi,
  /\bi\s+need\s+something\s+to\s+hold\s+([^.!?\n]+)/gi,
  /\bi\s+need\s+a\s+place\s+for\s+([^.!?\n]+)/gi,
  /\bi\s+should\s+get\s+(?:(?:a|an|some|the)\b\s*)?([^.!?\n]+)/gi,
  /\bneed\s+more\s+([^.!?\n]+)/gi,
  /\b(?:we(?:'re| are)|i(?:'m| am)|you(?:'re| are))?\s*out\s+of\s+([^.!?\n]+)/gi,
  /\brunning\s+low\s+on\s+([^.!?\n]+)/gi,
  /\blow\s+on\s+([^.!?\n]+)/gi,
  /\bcolton\s+(?:wants|needs)\s+([^.!?\n]+)/gi,
];

const LEADING_NOISE = /^(?:to\s+buy\s+|to\s+get\s+|get\s+|buy\s+|grab\s+|pick\s+up\s+|purchase\s+|a\s+|an\s+|some\s+|more\s+|another\s+|the\s+)/i;
const TRAILING_CONTEXT = /\s+(?:tomorrow|today|tonight|this\s+weekend|on\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?|before\s+work|after\s+work|while\s+i(?:'m| am)\s+at\s+work|remind\s+me\b|due\b|by\s+.+)\b.*$/i;
const SCHEDULE_SIGNAL = /\b(?:tomorrow|today|tonight|this\s+weekend|on\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?|before\s+work|after\s+work|remind\s+me|due|by\s+.+)\b/i;
const TITLE_NORMALIZE_NOISE = /^(?:get|buy|grab|pick\s+up|purchase|a|an|some|more|another|the)\s+/i;
const ACTION_REMINDER_GATE = /\b(?:need\s+to\s+remember\s+to|remember\s+to|remind\s+me\s+to|need\s+to\s+(?:renew|extend|submit|call|email|pay|book|schedule|sign\s+up|clean|tidy))\b/i;

const PET_TERMS = [
  'cat litter',
  'cat food',
  'wet food',
  'dog food',
  'pet treats',
  'litter',
  'pet food',
];

const HOME_SUPPLY_TERMS = [
  'laundry detergent',
  'toilet paper',
  'paper towel',
  'dish soap',
  'cleaner',
  'cleaning',
  'detergent',
];

const GROCERY_TERMS = [
  'milk',
  'bread',
  'eggs',
  'cheese',
  'ketchup',
  'cereal',
  'coffee',
  'butter',
  'juice',
  'gatorade',
  'lunch snacks',
  'snacks',
];

function cleanPhrase(value = '') {
  return String(value || '')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[,;:]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripLeadingNoise(value = '') {
  let out = cleanPhrase(value).replace(TRAILING_CONTEXT, '').trim();
  let prev = '';
  while (out && out !== prev) {
    prev = out;
    out = out.replace(LEADING_NOISE, '').trim();
  }
  return out;
}

function sentenceCase(value = '') {
  const s = cleanPhrase(value);
  if (!s) return '';
  return `${s.charAt(0).toUpperCase()}${s.slice(1)}`;
}

function normalizeTitle(raw = '', matchText = '') {
  const phrase = stripLeadingNoise(raw);
  const match = cleanPhrase(matchText).toLowerCase();

  if (match.includes('something to hold')) {
    if (/^something\s+to\s+hold\b/i.test(phrase)) {
      return sentenceCase(phrase.replace(/\bmy\b/gi, '').trim());
    }
    return sentenceCase(`something to hold ${phrase}`.replace(/\bmy\b/gi, '').trim());
  }

  if (match.includes('place for')) {
    if (/^place\s+for\b/i.test(phrase)) {
      return sentenceCase(phrase.replace(/\bmy\b/gi, '').trim());
    }
    return sentenceCase(`place for ${phrase}`.replace(/\bmy\b/gi, '').trim());
  }

  return sentenceCase(phrase.replace(/\bmy\b/gi, '').trim());
}

function includesAny(text, words) {
  const lower = String(text || '').toLowerCase();
  return words.some((word) => new RegExp(`\\b${escapeRegex(word)}\\b`, 'i').test(lower));
}

function escapeRegex(value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function classifyList(text = '') {
  const lower = String(text || '').toLowerCase();

  if (includesAny(lower, ['replace', 'replacement'])) return LISTS.replace;
  if (includesAny(lower, ['yarn', 'hook', 'craft', 'material'])) return LISTS.craft;
  if (includesAny(lower, ['colton', 'school', 'kid', 'child']) && includesAny(lower, ['school', 'papers', 'kid', 'child'])) return LISTS.colton;
  if (includesAny(lower, ['container', 'bin', 'basket', 'hold', 'place', 'storage'])) return LISTS.containers;
  if (includesAny(lower, PET_TERMS)) return LISTS.pet;
  if (includesAny(lower, HOME_SUPPLY_TERMS) || includesAny(lower, ['bathroom', 'kitchen', 'home', 'cleaning'])) return LISTS.home;
  if (includesAny(lower, GROCERY_TERMS) || /\b(?:out of|running low|low on|need more)\b/i.test(lower)) return LISTS.grocery;
  if (includesAny(lower, ['buy', 'get', 'purchase'])) return LISTS.buy;

  return LISTS.buy;
}

function extractTags(text = '') {
  const tags = [];
  const lower = String(text || '').toLowerCase();
  if (/\bcontainer|bin|basket|hold|place|storage\b/.test(lower)) tags.push('storage');
  if (/\breplace|replacement\b/.test(lower)) tags.push('replacement');
  if (/\bcolton|school|kid|child\b/.test(lower)) tags.push('colton');
  if (/\byarn|hook|craft|material\b/.test(lower)) tags.push('craft');
  if (/\bbathroom|kitchen|home|cleaning\b/.test(lower)) tags.push('home');
  if (includesAny(lower, PET_TERMS)) tags.push('pet');
  if (includesAny(lower, GROCERY_TERMS)) tags.push('grocery');
  return [...new Set(tags)];
}

export function normalizeGatherTitleKey(raw = '') {
  let out = cleanPhrase(raw)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  let prev = '';
  while (out && out !== prev) {
    prev = out;
    out = out.replace(TITLE_NORMALIZE_NOISE, '').replace(/\s+/g, ' ').trim();
  }

  return out;
}

function dedupe(items = []) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = `${item.title.toLowerCase()}|${item.list.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export function hasScheduledActionSignal(text = '') {
  return SCHEDULE_SIGNAL.test(String(text || ''));
}

export function extractGatherItems(text = '') {
  const sourceText = cleanPhrase(text);
  if (!sourceText) return [];
  if (ACTION_REMINDER_GATE.test(sourceText)) return [];

  const suggestions = [];

  for (const pattern of NEED_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(sourceText)) !== null) {
      const raw = cleanPhrase(match[1]);
      const title = normalizeTitle(raw, match[0]);
      if (!title || title.length < 3) continue;

      const classificationBasis = `${match[0]} ${title}`;
      suggestions.push({
        title,
        description: '',
        list: classifyList(classificationBasis),
        sourceText,
        confidence: 0.78,
        reason: 'needPhrase',
        tags: extractTags(classificationBasis),
      });
    }
  }

  return dedupe(suggestions).slice(0, MAX_SUGGESTIONS);
}

export default { extractGatherItems };
