const MAX_SUGGESTIONS = 5;

export const INTEREST_CATEGORIES = {
  learning: 'Learning Curiosities',
  try: 'Things to Try',
  creative: 'Creative Sparks',
  career: 'Career Curiosities',
  game: 'Game Interests',
  craft: 'Craft Interests',
  someday: 'Someday Skills',
  research: 'Research Rabbit Holes',
};

const INTEREST_PATTERNS = [
  { pattern: /\b(?:i(?:'d| would)\s+like|i\s+want)\s+to\s+learn\s+about\s+([^.!?\n]+)/gi, reason: 'learnAbout' },
  { pattern: /\bi\s+want\s+to\s+learn\s+([^.!?\n]+)/gi, reason: 'learnSkill' },
  { pattern: /\b(?:i(?:'d| would)\s+like|i\s+want)\s+to\s+try\s+([^.!?\n]+)/gi, reason: 'tryThing' },
  { pattern: /\bi(?:'m| am)\s+curious\s+about\s+([^.!?\n]+)/gi, reason: 'curiousAbout' },
  { pattern: /\bi\s+want\s+to\s+get\s+into\s+([^.!?\n]+)/gi, reason: 'getInto' },
  { pattern: /\bi(?:'ve| have)\s+been\s+interested\s+in\s+([^.!?\n]+)/gi, reason: 'interestedIn' },
  { pattern: /\bi\s+want\s+to\s+research\s+([^.!?\n]+)/gi, reason: 'research' },
  { pattern: /\b(?:i(?:'d| would)\s+like|i\s+want)\s+to\s+explore\s+([^.!?\n]+)/gi, reason: 'explore' },
  { pattern: /\bi\s+want\s+to\s+play\s+more\s+games\s+like\s+([^.!?\n]+)/gi, reason: 'gamesLike' },
  { pattern: /\bi\s+want\s+to\s+make\s+([^.!?\n]*?\bsomeday)\b/gi, reason: 'makeSomeday' },
];

const LEADING_NORMALIZE = /^(?:learn\s+about|learn|try|get\s+into|research|explore|make|play|a|an|the)\s+/i;
const BUY_OR_TRANSACTION = /\b(?:buy|order|purchase|pick\s+up|grab|get)\b/i;
const TASK_OR_SCHEDULE = /\b(?:should|need\s+to|have\s+to|must|remind\s+me|sign\s+up|register|book|schedule|call|email)\b/i;
const DATE_OR_TIME = /\b(?:today|tomorrow|tonight|this\s+weekend|on\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|january|february|march|april|may|june|july|august|september|october|november|december|\d{1,2}(?::\d{2})?\s*(?:am|pm)|\d{4}-\d{2}-\d{2})\b/i;
const EVENT_LANGUAGE = /\b(?:class|appointment|meeting|event|trip|deadline)\s+(?:is|at|on)\b/i;

const CRAFT_TERMS = ['needle felting', 'yarn', 'crochet', 'sewing', 'quilt', 'craft', 'knitting', 'embroidery'];
const CAREER_TERMS = ['career', 'admin assistant', 'contract', 'contracts', 'job', 'resume', 'portfolio', 'local contracts'];
const GAME_TERMS = ['game', 'games', 'modding', 'cozy game'];
const CREATIVE_TERMS = ['make', 'create', 'write', 'draw', 'paint', 'quilt'];

function escapeRegex(value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function includesAny(text, terms = []) {
  const lower = String(text || '').toLowerCase();
  return terms.some((term) => new RegExp(`\\b${escapeRegex(term)}\\b`, 'i').test(lower));
}

function cleanPhrase(value = '') {
  return String(value || '')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ')
    .replace(/[,;:]+$/g, '')
    .trim();
}

function stripTrailingContext(value = '') {
  return cleanPhrase(value)
    .replace(/^to\s+/i, '')
    .replace(/^(?:a|an|the)\s+/i, '')
    .replace(/\s+\b(?:someday|eventually|one day)\b\.?$/i, '')
    .trim();
}

function sentenceCase(value = '') {
  const phrase = stripTrailingContext(value);
  if (!phrase) return '';
  return `${phrase.charAt(0).toUpperCase()}${phrase.slice(1)}`;
}

function isBlockedSource(text = '') {
  const source = String(text || '');
  if (EVENT_LANGUAGE.test(source) && DATE_OR_TIME.test(source)) return true;
  if (TASK_OR_SCHEDULE.test(source) && DATE_OR_TIME.test(source)) return true;
  return false;
}

function isBlockedCandidate(candidate = '', reason = '') {
  const phrase = cleanPhrase(candidate);
  if (!phrase) return true;
  if (reason === 'getInto') return false;
  if (BUY_OR_TRANSACTION.test(phrase)) return true;
  return false;
}

function classifyCategory({ title, sourceText, reason }) {
  const basis = `${title} ${sourceText}`.toLowerCase();

  if (includesAny(basis, CAREER_TERMS)) return INTEREST_CATEGORIES.career;
  if (includesAny(basis, GAME_TERMS)) return INTEREST_CATEGORIES.game;
  if (includesAny(basis, CRAFT_TERMS)) return INTEREST_CATEGORIES.craft;
  if (reason === 'research') return INTEREST_CATEGORIES.research;
  if (/\b(?:someday|eventually|one day)\b/i.test(sourceText) && !includesAny(basis, CRAFT_TERMS)) {
    return INTEREST_CATEGORIES.someday;
  }
  if (includesAny(basis, CREATIVE_TERMS) || reason === 'makeSomeday') return INTEREST_CATEGORIES.creative;
  if (reason === 'tryThing') return INTEREST_CATEGORIES.try;
  return INTEREST_CATEGORIES.learning;
}

function extractTags({ title, sourceText, category }) {
  const tags = [];
  const basis = `${title} ${sourceText}`.toLowerCase();
  if (category === INTEREST_CATEGORIES.career) tags.push('career');
  if (category === INTEREST_CATEGORIES.game) tags.push('games');
  if (category === INTEREST_CATEGORIES.craft) tags.push('craft');
  if (category === INTEREST_CATEGORIES.creative) tags.push('creative');
  if (category === INTEREST_CATEGORIES.research) tags.push('research');
  if (/\blearn|curious|interested\b/.test(basis)) tags.push('learning');
  return [...new Set(tags)];
}

export function normalizeInterestTitleKey(raw = '') {
  let out = cleanPhrase(raw)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  let prev = '';
  while (out && out !== prev) {
    prev = out;
    out = out.replace(LEADING_NORMALIZE, '').replace(/\s+/g, ' ').trim();
  }

  return out;
}

function dedupe(items = []) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = `${item.category.toLowerCase()}|${normalizeInterestTitleKey(item.title)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export function extractInterests(text = '') {
  const sourceText = cleanPhrase(text);
  if (!sourceText || isBlockedSource(sourceText)) return [];

  const suggestions = [];

  for (const { pattern, reason } of INTEREST_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(sourceText)) !== null) {
      const raw = cleanPhrase(match[1]);
      if (isBlockedCandidate(raw, reason)) continue;
      const title = sentenceCase(raw);
      if (!title || title.length < 3) continue;
      const category = classifyCategory({ title, sourceText, reason });
      suggestions.push({
        title,
        description: '',
        category,
        sourceText,
        confidence: 0.76,
        reason,
        tags: extractTags({ title, sourceText, category }),
      });
    }
  }

  return dedupe(suggestions).slice(0, MAX_SUGGESTIONS);
}

export function isInterestOnlyEntry(text = '') {
  return extractInterests(text).length > 0;
}

export default { extractInterests, normalizeInterestTitleKey, isInterestOnlyEntry };
