import { extractRipples } from './rippleExtractor.js';
import { suggestMetadata } from '../frontend/src/utils/suggestMetadata.js';

export function analyzeEntry(entryText, opts = {}) {
  // Run ripple extraction on the entry
  const ripples = extractRipples([{ content: entryText }]);
  // Run gentle contextual suggestion
  const suggestions = suggestMetadata(entryText);

  // Combine tag/mood/cluster suggestions
  const tags = Array.from(new Set([
    ...(suggestions.tags?.map(t => t.name) || []),
    // Optionally: pull from ripple contexts or hashtags, up to you!
  ]));

  const moods = Array.from(new Set([
    ...(suggestions.moods?.map(m => m.name) || []),
    // Optionally: pull dominant mood from ripples, if you want!
  ]));

  const clusters = Array.from(new Set([
    ...(suggestions.clusters?.map(c => c.name) || []),
    // Optionally: pull from ripple context/cluster info if used
  ]));

  return {
    tags,
    moods,
    clusters,
    ripples,
    suggestions,      // the full rich suggestMetadata output
    context: suggestions.context,
    suggestedRelationships: suggestions.suggestedRelationships,
    metadata: suggestions.metadata
  };
}
