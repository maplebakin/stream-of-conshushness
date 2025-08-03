// ─────────────────────────────────────────────
//  suggestMetadata.js  —  enhanced & bug-fixed
// ─────────────────────────────────────────────

const moodIndicators = [
  'happy', 'sad', 'angry', 'anxious', 'excited', 'tired', 'calm', 'overwhelmed',
  'hyperfocused', 'dysregulated', 'validated', 'aligned', 'awakening'
];

const contextTags = [
  'reflection', 'dream', 'spiritual', 'neurodivergent', 'work', 'parenting',
  'routine', 'relationship', 'identity', 'energy', 'ritual', 'manifestation'
];

const priorityIndicators = [
  'urgent', 'asap', 'critical', 'important', 'time sensitive',
  'low priority', 'someday', 'can wait', 'procrastinating'
];

const timeIndicators = [
  'today', 'tomorrow', 'this week', 'next month', 'before', 'after',
  'soon', 'later', 'eventually', 'deadline', 'recurring', 'every'
];

/*─────────────────────────────────────────────
  Helper utilities
─────────────────────────────────────────────*/

function analyzeMood(text) {
  const moods = analyzeWithDiversity(text, enhancedMoodPatterns, 'moods');
  return {
    moods: moods.map(m => m.category),
    details: moods
  };
}

function analyzePriority(text) {
  const lower = text.toLowerCase();
  if (/\b(urgent|critical|asap|important)\b/.test(lower)) return 'high';
  if (/\b(should|need to|must|priority)\b/.test(lower)) return 'medium';
  return 'low';
}

const analyzeContext = content => analyzeEnhancedContext(content);

function analyzeTimeSensitivity(text) {
  const lower = text.toLowerCase();
  if (/\b(today|now|immediately|asap|urgent)\b/.test(lower)) return 'immediate';
  if (/\b(tomorrow|soon|this week)\b/.test(lower)) return 'short_term';
  if (/\b(next week|next month|eventually|someday)\b/.test(lower)) return 'long_term';
  return 'unspecified';
}

function extractTags(text) {
  const matches = text.match(/#(\w+)/g);
  return matches ? matches.map(t => t.slice(1)) : [];
}

function calculateConfidence(match, type) {
  let base = 0.5;
  if (/need to|must/.test(match[0])) base += 0.3;
  if (/urgent|important/.test(match[0])) base += 0.2;
  if (/maybe|might/.test(match[0])) base -= 0.2;

  const len = (match[1] || '').trim().length;
  if (len > 20) base += 0.1;
  if (len < 5) base -= 0.2;

  return Math.max(0.1, Math.min(1.0, base));
}

/*─────────────────────────────────────────────
  Pattern libraries (unchanged, assumed imported)
─────────────────────────────────────────────*/

const neurodivergentPatterns = {};
const metaphysicalPatterns   = {};
const neurodivergentMoods    = {};
const processingStyles       = {};
const enhancedTagPatterns     = {};
const enhancedMoodPatterns    = {};
const enhancedClusterPatterns = {};

/*─────────────────────────────────────────────
  Core multi-dimensional analyser
─────────────────────────────────────────────*/
function analyzeWithDiversity(content, patterns, analysisType = 'general') {
  const lowerContent = content.toLowerCase();
  const results = [];

  const levels = {
    primary: 3,
    secondary: 2,
    contextual: 1.5,
    mild: 1,
    moderate: 2,
    intense: 3,
    neurodivergent_friendly: 2.5,
    accommodations: 2,
    considerations: 1.5,
    phrase: 2.5
  };

  Object.entries(patterns).forEach(([category, data]) => {
    let score = 0;
    let intensity = 'mild';
    const matches = [];
    const culturalContext = [];

    Object.entries(data).forEach(([level, keywords]) => {
      if (level === 'phrases' && Array.isArray(keywords)) {
        keywords.forEach(phrase => {
          const rx = new RegExp(phrase, phrase.flags?.replace('g', ''));
          if (rx.test(content)) {
            score += levels.phrase;
            matches.push({ phrase: phrase.source, level: 'phrase', weight: levels.phrase });
          }
        });
        return;
      }

      if (Array.isArray(keywords)) {
        keywords.forEach(keyword => {
          if (typeof keyword === 'string' && lowerContent.includes(keyword.toLowerCase())) {
            const weight = levels[level] || 1;
            score += weight;
            matches.push({ keyword, level, weight });

            if (level === 'intense') intensity = 'intense';
            else if (level === 'moderate' && intensity !== 'intense') intensity = 'moderate';

            if (level.includes('neurodivergent') || level.includes('accommodations'))
              culturalContext.push('neurodivergent');
            if (level.includes('metaphysical') || level.includes('spiritual'))
              culturalContext.push('metaphysical');
          }
        });
      }
    });

    if (score > 0) {
      results.push({
        category,
        score,
        intensity,
        matches,
        confidence: Math.min(score / 5, 1),
        relationships: data.relationships || [],
        culturalContext: [...new Set(culturalContext)],
        accommodations: data.accommodations || [],
        considerations: data.considerations || []
      });
    }
  });

  return results.sort((a, b) => b.score - a.score);
}

function analyzeEnhancedContext(content) { return {}; }

function calculateInclusiveConfidence(results, content) {
  return results.map(item => ({
    ...item,
    adjustedConfidence: item.confidence // ← stubbed for now
  }));
}

/*─────────────────────────────────────────────
  Public API
─────────────────────────────────────────────*/
export function suggestMetadata(content) {
  if (!content || typeof content !== 'string') {
    return {
      tags: [], moods: [], clusters: [], confidence: 0, context: null,
      accessibility: { processingStyles: [], accommodations: [] },
      diversity:      { perspectives: [], culturalContexts: [] }
    };
  }

  const tagResults     = analyzeWithDiversity(content, enhancedTagPatterns,   'tags');
  const moodResults    = analyzeWithDiversity(content, enhancedMoodPatterns,  'moods');
  const clusterResults = analyzeWithDiversity(content, enhancedClusterPatterns,'clusters');
  const context        = analyzeEnhancedContext(content);

  const adjTags     = calculateInclusiveConfidence(tagResults,     content);
  const adjMoods    = calculateInclusiveConfidence(moodResults,    content);
  const adjClusters = calculateInclusiveConfidence(clusterResults, content);

  const THRESH = 0.2;
  const highTags     = adjTags.filter(t => t?.adjustedConfidence >= THRESH);
  const highMoods    = adjMoods.filter(m => m?.adjustedConfidence >= THRESH);
  const highClusters = adjClusters.filter(c => c?.adjustedConfidence >= THRESH);

  const relationships    = new Set();
  const accommodations   = new Set();
  const culturalContexts = new Set();

  [...highTags, ...highClusters].forEach(item => {
    item.relationships?.forEach(rel => relationships.add(rel));
    item.accommodations?.forEach(acc => accommodations.add(acc));
    item.culturalContext?.forEach(ctx => culturalContexts.add(ctx));
  });

  return {
    tags: highTags.map(t => ({
      name: t.category,
      confidence: t.adjustedConfidence ?? 0,
      intensity: t.intensity,
      matches: t.matches.length,
      culturalContext: t.culturalContext,
      accommodations: t.accommodations
    })),
    moods: highMoods.map(m => ({
      name: m.category,
      confidence: m.adjustedConfidence ?? 0,
      intensity: m.intensity,
      matches: m.matches.length,
      culturalContext: m.culturalContext
    })),
    clusters: highClusters.map(c => ({
      name: c.category,
      confidence: c.adjustedConfidence ?? 0,
      relationships: c.relationships,
      matches: c.matches.length,
      accommodations: c.accommodations,
      considerations: c.considerations
    })),
    context: {
      ...context,
      accessibility: {
        processingStyles: context.processingStyle ?? [],
        communicationStyle: context.communicationStyle ?? [],
        energyLevel: context.energyLevel ?? []
      },
      diversity: {
        neurodivergentMarkers: context.neurodivergentMarkers?.length ?? 0,
        metaphysicalElements: context.metaphysicalElements?.length ?? 0,
        culturalContexts: Array.from(culturalContexts)
      }
    },
    suggestedRelationships: Array.from(relationships),
    suggestedAccommodations: Array.from(accommodations),
    metadata: {
      analyzedAt: new Date().toISOString(),
      contentLength: content.length,
      wordCount: content.split(/\s+/).length,
      overallConfidence: Math.max(
        ...highTags.map(t => t.adjustedConfidence ?? 0),
        ...highMoods.map(m => m.adjustedConfidence ?? 0),
        ...highClusters.map(c => c.adjustedConfidence ?? 0),
        0
      ),
      diversityScore: culturalContexts.size * 0.2,
      accessibilityScore: accommodations.size * 0.1,
      inclusivityMetrics: {
        neurodivergentFriendly: context.neurodivergentMarkers?.length > 0,
        metaphysicalAware:      context.metaphysicalElements?.length > 0,
        multipleProcessingStyles: (context.processingStyle?.length ?? 0) > 1,
        accommodationSuggestions: accommodations.size
      }
    }
  };
}

// — named exports for other modules
export {
  moodIndicators,
  contextTags,
  priorityIndicators,
  timeIndicators,
  analyzeMood,
  analyzePriority,
  analyzeContext,
  analyzeTimeSensitivity,
  extractTags,
  calculateConfidence
};

export default suggestMetadata;
