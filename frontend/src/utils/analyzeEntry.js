// utils/analyzeEntry.js
import suggestMetadata from './suggestMetadata.js';

/**
 * Lightweight wrapper – pulls tag, mood, and cluster arrays from suggestMetadata
 * and guarantees they’re always arrays (never undefined).
 */
export function analyzeEntry(content = '') {
  let result = {};
  try {
    result = suggestMetadata(content);
  } catch (err) {
    console.warn('analyzeEntry → suggestMetadata failed:', err);
  }

  const {
    tags = [],
    moods = [],
    clusters = [],
    context = null,
    confidence = 0,
  } = result;

  return { tags, moods, clusters, context, confidence };
}
