// utils/analyzeEntry.js
// Thin analyzer that delegates to the calmer ripple extractor.
// Returns shape that entries route already expects (mood/tags optional, ripples present).

import { extractRipplesFromEntry } from './rippleExtractor.js';

// Super-light mood/tags placeholders (kept minimal to avoid overreach)
function quickMood(text) {
  if (!text) return '';
  if (/\b(grateful|thankful|joy|happy|win|yay)\b/i.test(text)) return 'up';
  if (/\b(tired|sad|overwhelmed|anxious|angry)\b/i.test(text)) return 'down';
  return '';
}

function quickTags(text) {
  const tags = new Set();
  if (/\bcolton\b/i.test(text)) tags.add('Colton');
  if (/\bcrochet\b/i.test(text)) tags.add('Crochet');
  if (/\bgame|gaming|steam|switch\b/i.test(text)) tags.add('Games');
  return Array.from(tags);
}

/**
 * analyzeEntry({ text, html, date })
 * - date: 'YYYY-MM-DD' (America/Toronto normalized) – optional
 * - returns: { mood, tags, ripples }
 */
export function analyzeEntry({ text = '', html = '', date = null } = {}) {
  const body = text || (html ? html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '');
  const mood = quickMood(body);
  const tags = quickTags(body);

  const { ripples } = extractRipplesFromEntry({
    text: body,
    entryDate: date || null,
    originalContext: text || html || ''
  });

  return { mood, tags, ripples };
}

export default analyzeEntry;
