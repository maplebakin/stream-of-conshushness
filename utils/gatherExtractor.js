const MAX_SUGGESTIONS = 5;

const LISTS = {
  containers: 'Needed Containers',
  buy: 'Things to Buy',
  replace: 'Things to Replace',
  craft: 'Craft Supplies',
  colton: 'Colton Needs',
  home: 'Home Supplies',
};

const NEED_PATTERNS = [
  /\b(?:i|we)\s+need\s+(?:(?:a|an|some|the)\b\s*)?([^.!?\n]+)/gi,
  /\bi\s+need\s+something\s+to\s+hold\s+([^.!?\n]+)/gi,
  /\bi\s+need\s+a\s+place\s+for\s+([^.!?\n]+)/gi,
  /\bi\s+should\s+get\s+(?:(?:a|an|some|the)\b\s*)?([^.!?\n]+)/gi,
];

const LEADING_NOISE = /^(?:to\s+buy\s+|to\s+get\s+|a\s+|an\s+|some\s+|the\s+)/i;

function cleanPhrase(value = '') {
  return String(value || '')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[,;:]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripLeadingNoise(value = '') {
  let out = cleanPhrase(value);
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
  return words.some((word) => new RegExp(`\\b${word}\\b`, 'i').test(lower));
}

function classifyList(text = '') {
  const lower = String(text || '').toLowerCase();

  if (includesAny(lower, ['replace', 'replacement'])) return LISTS.replace;
  if (includesAny(lower, ['colton', 'school', 'kid', 'child'])) return LISTS.colton;
  if (includesAny(lower, ['yarn', 'hook', 'craft', 'material'])) return LISTS.craft;
  if (includesAny(lower, ['container', 'bin', 'basket', 'hold', 'place', 'storage'])) return LISTS.containers;
  if (includesAny(lower, ['bathroom', 'kitchen', 'home', 'cleaning'])) return LISTS.home;
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
  return [...new Set(tags)];
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

export function extractGatherItems(text = '') {
  const sourceText = cleanPhrase(text);
  if (!sourceText) return [];

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
