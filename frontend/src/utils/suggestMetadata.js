// ─────────────────────────────────────────────
//  suggestMetadata.js  —  refined August 2025
// ─────────────────────────────────────────────

export const moodIndicators = [
  'happy','sad','angry','anxious','excited','tired','calm','overwhelmed',
  'hyperfocused','dysregulated','validated','aligned','awakening'
];

export const contextTags = [
  'reflection','dream','spiritual','neurodivergent','work','parenting',
  'routine','relationship','identity','energy','ritual','manifestation'
];

export const priorityIndicators = [
  'urgent','asap','critical','important','time sensitive',
  'low priority','someday','can wait','procrastinating'
];

export const timeIndicators = [
  'today','tomorrow','this week','next month','before','after',
  'soon','later','eventually','deadline','recurring','every'
];

/*-------------------------------------------------
  Core analyzers
-------------------------------------------------*/
export function analyzeMood(text = '') {
  const moods = analyzeWithDiversity(text, enhancedMoodPatterns);
  return {
    moods   : moods.map(m => m.category),
    details : moods
  };
}

export function analyzePriority(text = '') {
  const lower = text.toLowerCase();
  if (/\b(urgent|critical|asap|important)\b/.test(lower)) return 'high';
  if (/\b(should|need to|must|priority)\b/.test(lower))   return 'medium';
  return 'low';
}

export const analyzeContext = (content) => analyzeEnhancedContext(content);

export function analyzeTimeSensitivity(text = '') {
  const lower = text.toLowerCase();
  if (/\b(today|now|immediately|asap|urgent)\b/.test(lower))            return 'immediate';
  if (/\b(tomorrow|soon|this week)\b/.test(lower))                      return 'short_term';
  if (/\b(next week|next month|eventually|someday)\b/.test(lower))      return 'long_term';
  return 'unspecified';
}

export function extractTags(text = '') {
  const matches = text.match(/#(\w+)/g);
  return matches ? matches.map(t => t.slice(1)) : [];
}

export function calculateConfidence(match, type) {
  let base = 0.5;
  if (/need to|must/.test(match[0]))       base += 0.3;
  if (/urgent|important/.test(match[0]))   base += 0.2;
  if (/maybe|might/.test(match[0]))        base -= 0.2;

  const captured = (match[1] ?? '').trim();
  const len = captured.length;
  if (len > 20)  base += 0.1;
  if (len && len < 5) base -= 0.2;

  return Math.max(0.1, Math.min(1.0, base));
}

/*-------------------------------------------------
  Diversity / context engine (pattern libs stubbed)
-------------------------------------------------*/
const enhancedTagPatterns      = {};
const enhancedMoodPatterns     = {};
const enhancedClusterPatterns  = {};

function analyzeEnhancedContext(content = '') {
  const lower = content.toLowerCase();

  const neurodivergentMarkers = ['adhd','autistic','sensory','stimming']
    .filter(word => lower.includes(word));
  const metaphysicalElements  = ['manifest','tarot','chakra','astro']
    .filter(word => lower.includes(word));

  const processingStyle = [];
  if (/visual/i.test(lower))  processingStyle.push('visual');
  if (/auditory/i.test(lower)) processingStyle.push('auditory');

  return {
    neurodivergentMarkers,
    metaphysicalElements,
    processingStyle,
    communicationStyle: [],
    energyLevel: []
  };
}

function analyzeWithDiversity(content, patterns) {
  const lowerContent = content.toLowerCase();
  const results = [];
  const weight = { primary:3, secondary:2, contextual:1.5, mild:1, moderate:2, intense:3 };

  Object.entries(patterns).forEach(([category, data]) => {
    let score = 0;
    let intensity = 'mild';
    const matches = [];
    const culturalContext = [];

    Object.entries(data).forEach(([level, keywords]) => {
      if (!Array.isArray(keywords)) return;
      keywords.forEach(keyword => {
        if (lowerContent.includes(keyword.toLowerCase())) {
          const w = weight[level] || 1;
          score += w;
          matches.push({ keyword, level, weight:w });
          if (level === 'intense') intensity = 'intense';
          else if (level === 'moderate' && intensity !== 'intense') intensity = 'moderate';
          if (level.includes('neurodivergent')) culturalContext.push('neurodivergent');
          if (level.includes('metaphysical'))   culturalContext.push('metaphysical');
        }
      });
    });

    if (score > 0) {
      results.push({
        category,
        score,
        intensity,
        matches,
        confidence: Math.min(score / 5, 1),
        culturalContext: [...new Set(culturalContext)]
      });
    }
  });

  return results.sort((a, b) => b.score - a.score);
}

function calculateInclusiveConfidence(results) {
  return results.map(r => ({ ...r, adjustedConfidence: r.confidence }));
}

/*-------------------------------------------------
  Public high-level API
-------------------------------------------------*/
export default function suggestMetadata(content) {
  if (typeof content !== 'string' || !content.trim()) {
    return {
      tags: [], moods: [], clusters: [], context:null, suggestedRelationships:[], suggestedAccommodations:[],
      metadata:{ analyzedAt:new Date().toISOString(), contentLength:0, wordCount:0, overallConfidence:0 }
    };
  }

  const tagRes     = analyzeWithDiversity(content, enhancedTagPatterns);
  const moodRes    = analyzeWithDiversity(content, enhancedMoodPatterns);
  const clusterRes = analyzeWithDiversity(content, enhancedClusterPatterns);
  const context    = analyzeEnhancedContext(content);

  const adjTags     = calculateInclusiveConfidence(tagRes);
  const adjMoods    = calculateInclusiveConfidence(moodRes);
  const adjClusters = calculateInclusiveConfidence(clusterRes);

  const THRESH = 0.2;
  const keepTags     = adjTags.filter(t => t.adjustedConfidence >= THRESH);
  const keepMoods    = adjMoods.filter(m => m.adjustedConfidence >= THRESH);
  const keepClusters = adjClusters.filter(c => c.adjustedConfidence >= THRESH);

  return {
    tags : keepTags.map(t => ({ name:t.category, confidence:t.adjustedConfidence, intensity:t.intensity })),
    moods: keepMoods.map(m => ({ name:m.category, confidence:m.adjustedConfidence, intensity:m.intensity })),
    clusters: keepClusters.map(c => ({ name:c.category, confidence:c.adjustedConfidence })),
    context,
    metadata:{
      analyzedAt: new Date().toISOString(),
      contentLength: content.length,
      wordCount: content.split(/\s+/).length,
      overallConfidence: Math.max(
        ...keepTags.map(t => t.adjustedConfidence),
        ...keepMoods.map(m => m.adjustedConfidence),
        ...keepClusters.map(c => c.adjustedConfidence),
        0
      )
    }
  };
}
