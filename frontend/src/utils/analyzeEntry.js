// utils/analyzeEntry.js
import { suggestMetadata } from './suggestMetadata.js';

/**
 * Lightweight wrapper – pulls tag, mood, and cluster arrays from suggestMetadata
 * and guarantees they’re always arrays (never undefined).
 */
export function analyzeEntry(content = '') {
  // Run the heavy NLP; fall back to an empty object if it throws
  let result = {};
  try {
    result = suggestMetadata(content);
  } catch (err) {
    console.warn('analyzeEntry → suggestMetadata failed:', err);
  }

  // Destructure with safe defaults
  const {
    tags     = [],   // always an array
    moods    = [],
    clusters = [],
    context  = null,
    confidence = 0,
  } = result;

  return { tags, moods, clusters, context, confidence };
}
