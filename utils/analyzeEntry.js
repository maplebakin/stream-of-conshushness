// utils/analyzeEntry.js
// Turns an entry's text/html into analysis artifacts (ripples, mood/tags later).

import { extractRipples, extractEntrySuggestions } from './rippleExtractor.js';

/** naive HTML → text */
function toPlainText(input = '') {
  const s = String(input || '');
  // strip tags
  const noTags = s.replace(/<[^>]+>/g, ' ');
  // unescape a few common entities
  return noTags
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * analyzeEntry
 * @param {Object} args
 * @param {string} args.text - raw/plain text (optional)
 * @param {string} args.html - rich html (optional)
 * @param {string} args.entryDate - 'YYYY-MM-DD'
 * @param {string} args.userId
 * @param {string} args.sourceEntryId - Entry _id once created
 */
export function analyzeEntry({ text = '', html = '', entryDate, userId, sourceEntryId }) {
  const plain = toPlainText(text || html);

  // Use our new extractor (alias kept for older callers)
  const ripples = extractRipples({
    text: plain,
    entryDate,
    userId,
    sourceEntryId
  });

  // In case some legacy code still expects the old name:
  const suggestions = extractEntrySuggestions({
    text: plain,
    entryDate,
    userId,
    sourceEntryId
  });

  // They’re the same right now; prefer ripples. Keep both keys for compatibility.
  return {
    ripples,
    suggestions
  };
}

export default { analyzeEntry };
