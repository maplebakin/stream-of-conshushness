// utils/analyzeEntry.js
// Turns an entry's text/html into analysis artifacts (ripples now, room for mood/tags later).
import { extractRipples } from './rippleExtractor.js';

/** naive HTML → text */
function toPlainText(input = '') {
  const s = String(input || '');
  const noTags = s.replace(/<[^>]+>/g, ' ');
  return noTags
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

export function analyzeEntry({ text = '', html = '', entryDate, userId, sourceEntryId }) {
  const plain = text ? String(text) : toPlainText(html);

  const ripples = extractRipples({
    text: plain,
    entryDate,
    userId,
    sourceEntryId
  });

  return { ripples };
}

export default { analyzeEntry };
