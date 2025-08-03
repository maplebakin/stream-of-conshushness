// Mood indicators (base layer for affective analysis)
const moodIndicators = [
  'happy', 'sad', 'angry', 'anxious', 'excited', 'tired', 'calm', 'overwhelmed',
  'hyperfocused', 'dysregulated', 'validated', 'aligned', 'awakening'
];

// Contextual themes for filtering and organizing entries
const contextTags = [
  'reflection', 'dream', 'spiritual', 'neurodivergent', 'work', 'parenting',
  'routine', 'relationship', 'identity', 'energy', 'ritual', 'manifestation'
];

// Priority indicators for task urgency/emotion
const priorityIndicators = [
  'urgent', 'asap', 'critical', 'important', 'time sensitive',
  'low priority', 'someday', 'can wait', 'procrastinating'
];

// Time-related phrasing patterns
const timeIndicators = [
  'today', 'tomorrow', 'this week', 'next month', 'before', 'after',
  'soon', 'later', 'eventually', 'deadline', 'recurring', 'every'
];
// Analyze mood from text
function analyzeMood(text) {
  const moods = analyzeWithDiversity(text, enhancedMoodPatterns, 'moods');
  return {
    moods: moods.map(m => m.category),
    details: moods
  };
}

// Analyze priority from text
function analyzePriority(text) {
  const lower = text.toLowerCase();
  if (/\b(urgent|critical|asap|important)\b/.test(lower)) return 'high';
  if (/\b(should|need to|must|priority)\b/.test(lower)) return 'medium';
  return 'low';
}

// Analyze context from text
function analyzeContext(text) {
  return analyzeEnhancedContext(text);
}

// Analyze time sensitivity
function analyzeTimeSensitivity(text) {
  const lower = text.toLowerCase();
  if (/\b(today|now|immediately|asap|urgent)\b/.test(lower)) return 'immediate';
  if (/\b(tomorrow|soon|this week)\b/.test(lower)) return 'short_term';
  if (/\b(next week|next month|eventually|someday)\b/.test(lower)) return 'long_term';
  return 'unspecified';
}

// Dummy tag extractor for now (optional)
function extractTags(text) {
  const tags = [];
  if (text.includes('#')) {
    const matches = text.match(/#(\w+)/g);
    if (matches) {
      tags.push(...matches.map(t => t.slice(1)));
    }
  }
  return tags;
}

// Re-declare if using in both files
function calculateConfidence(match, type, text) {
  let base = 0.5;
  if (match[0].includes('need to') || match[0].includes('must')) base += 0.3;
  if (match[0].includes('urgent') || match[0].includes('important')) base += 0.2;
  if (match[0].includes('maybe') || match[0].includes('might')) base -= 0.2;
  const extractedLength = (match[1] || '').trim().length;
  if (extractedLength > 20) base += 0.1;
  if (extractedLength < 5) base -= 0.2;
  return Math.max(0.1, Math.min(1.0, base));
}


// Neurodivergent-friendly processing patterns
const neurodivergentPatterns = {
  hyperfocus: {
    primary: ['hyperfocus', 'deep dive', 'obsessing', 'fixated', 'completely absorbed'],
    secondary: ['tunnel vision', 'lost track of time', 'hours flew by', 'in the zone'],
    contextual: ['special interest', 'research rabbit hole', 'intense concentration'],
    phrases: [/lost in/gi, /couldn't stop/gi, /hours without realizing/gi, /totally absorbed/gi]
  },
  sensory: {
    primary: ['overstimulated', 'sensory overload', 'overwhelmed by noise', 'texture issues'],
    secondary: ['too bright', 'too loud', 'crowded', 'overwhelming environment'],
    contextual: ['need quiet space', 'sensory break', 'stimming', 'noise cancelling'],
    phrases: [/too much stimulation/gi, /need to decompress/gi, /sensory issues/gi]
  },
  executive_function: {
    primary: ['executive dysfunction', 'procrastination', 'task switching', 'planning difficulty'],
    secondary: ['overwhelmed by choices', 'decision fatigue', 'mental fog', 'scattered'],
    contextual: ['time blindness', 'working memory', 'attention regulation'],
    phrases: [/can't get started/gi, /brain fog/gi, /executive function/gi, /task paralysis/gi]
  },
  masking: {
    primary: ['masking', 'camouflaging', 'people pleasing', 'exhausted from pretending'],
    secondary: ['performing normalcy', 'social exhaustion', 'hiding true self'],
    contextual: ['authenticity struggle', 'burnout from masking', 'social scripts'],
    phrases: [/pretending to be normal/gi, /wearing a mask/gi, /social exhaustion/gi]
  },
  pattern_recognition: {
    primary: ['pattern', 'connection', 'systematic', 'analytical thinking'],
    secondary: ['categorizing', 'organizing thoughts', 'seeing relationships'],
    contextual: ['detail-oriented', 'systematic approach', 'logical frameworks'],
    phrases: [/noticed a pattern/gi, /everything connects/gi, /systematic thinking/gi]
  }
};

// Metaphysical and spiritual patterns
const metaphysicalPatterns = {
  energy: {
    primary: ['energy', 'vibration', 'frequency', 'aura', 'chakra'],
    secondary: ['feeling drained', 'energized', 'heavy energy', 'light energy'],
    contextual: ['energy healing', 'vibrational alignment', 'energetic boundaries'],
    phrases: [/energy feels/gi, /vibrational shift/gi, /energy vampire/gi, /raising vibration/gi]
  },
  intuition: {
    primary: ['intuition', 'gut feeling', 'inner knowing', 'psychic', 'clairvoyant'],
    secondary: ['premonition', 'synchronicity', 'signs', 'messages from universe'],
    contextual: ['third eye', 'inner wisdom', 'divine guidance', 'spiritual downloads'],
    phrases: [/something tells me/gi, /inner voice/gi, /gut instinct/gi, /divine guidance/gi]
  },
  manifestation: {
    primary: ['manifestation', 'law of attraction', 'co-creating', 'intention setting'],
    secondary: ['visualizing', 'affirming', 'calling in', 'aligning with desires'],
    contextual: ['abundance mindset', 'magnetic energy', 'vibrational match'],
    phrases: [/manifesting/gi, /calling in/gi, /law of attraction/gi, /co-creating with universe/gi]
  },
  shadow_work: {
    primary: ['shadow work', 'inner child', 'healing trauma', 'integration'],
    secondary: ['triggered', 'projection', 'unconscious patterns', 'repressed emotions'],
    contextual: ['carl jung', 'depth psychology', 'psychological healing'],
    phrases: [/shadow work/gi, /inner child healing/gi, /working through trauma/gi]
  },
  ascension: {
    primary: ['ascension', 'awakening', 'consciousness shift', 'spiritual evolution'],
    secondary: ['higher self', 'dimensional shift', 'consciousness expansion'],
    contextual: ['lightworker', 'starseed', 'spiritual mission', 'soul purpose'],
    phrases: [/spiritual awakening/gi, /consciousness rising/gi, /soul mission/gi]
  },
  moon_cycles: {
    primary: ['new moon', 'full moon', 'lunar cycle', 'moon energy'],
    secondary: ['waxing moon', 'waning moon', 'moon ritual', 'lunar influence'],
    contextual: ['moon magic', 'celestial events', 'cosmic energy'],
    phrases: [/moon phase/gi, /lunar energy/gi, /moon ritual/gi, /cosmic alignment/gi]
  },
  synchronicity: {
    primary: ['synchronicity', 'meaningful coincidence', 'divine timing', 'universe speaking'],
    secondary: ['signs', 'angel numbers', 'repeated patterns', 'cosmic winks'],
    contextual: ['meaningful connections', 'spiritual breadcrumbs', 'guided path'],
    phrases: [/not a coincidence/gi, /universe is showing me/gi, /divine timing/gi, /angel numbers/gi]
  }
};

// Enhanced emotional processing for neurodivergent experiences
const neurodivergentMoods = {
  overwhelmed: {
    intense: ['completely overwhelmed', 'shutdown mode', 'system overload', 'paralyzed'],
    moderate: ['overwhelmed', 'too much input', 'overstimulated', 'frazzled'],
    mild: ['slightly overwhelmed', 'reaching capacity', 'need space'],
    contextual: ['sensory overload', 'information overload', 'choice paralysis'],
    phrases: [/can't handle/gi, /too much at once/gi, /need to shut down/gi, /system overload/gi]
  },
  hyperfocused: {
    intense: ['completely absorbed', 'lost in flow', 'time doesn\'t exist', 'transcendent focus'],
    moderate: ['hyperfocused', 'in the zone', 'deep concentration', 'tunnel vision'],
    mild: ['focused', 'engaged', 'concentrated'],
    contextual: ['flow state', 'special interest activated', 'optimal engagement'],
    phrases: [/hours flew by/gi, /completely absorbed/gi, /lost track of time/gi, /in flow state/gi]
  },
  dysregulated: {
    intense: ['completely dysregulated', 'emotional chaos', 'meltdown approaching'],
    moderate: ['dysregulated', 'emotionally unstable', 'all over the place'],
    mild: ['slightly off', 'emotionally wobbly', 'need regulation'],
    contextual: ['emotional overwhelm', 'nervous system activation', 'need coping tools'],
    phrases: [/emotionally dysregulated/gi, /nervous system activated/gi, /need grounding/gi]
  },
  validated: {
    intense: ['deeply validated', 'finally understood', 'completely seen'],
    moderate: ['validated', 'understood', 'accepted', 'recognized'],
    mild: ['acknowledged', 'heard', 'seen'],
    contextual: ['neurodivergent pride', 'self-acceptance', 'identity affirmation'],
    phrases: [/finally understood/gi, /feel seen/gi, /not alone/gi, /valid experience/gi]
  }
};

// Processing style patterns for different cognitive approaches
const processingStyles = {
  visual: {
    primary: ['visual', 'image', 'picture', 'diagram', 'chart'],
    secondary: ['mind map', 'flowchart', 'visualization', 'sketch'],
    contextual: ['visual thinking', 'spatial processing', 'graphic organizer'],
    phrases: [/picture this/gi, /visual representation/gi, /see it clearly/gi]
  },
  kinesthetic: {
    primary: ['hands-on', 'movement', 'tactile', 'physical', 'embodied'],
    secondary: ['fidgeting', 'pacing', 'restless', 'need to move'],
    contextual: ['body wisdom', 'somatic experience', 'kinesthetic learning'],
    phrases: [/need to move/gi, /hands-on learning/gi, /feel it in my body/gi]
  },
  auditory: {
    primary: ['sound', 'music', 'voice', 'listening', 'auditory'],
    secondary: ['podcast', 'audio', 'verbal', 'spoken'],
    contextual: ['sound sensitivity', 'musical processing', 'verbal reasoning'],
    phrases: [/sounds like/gi, /heard this/gi, /listening to/gi, /resonates/gi]
  },
  systematic: {
    primary: ['system', 'structure', 'framework', 'methodology', 'process'],
    secondary: ['step by step', 'logical', 'sequential', 'organized'],
    contextual: ['analytical thinking', 'systematic approach', 'detailed planning'],
    phrases: [/systematic approach/gi, /step by step/gi, /logical framework/gi]
  }
};

// Expanded original patterns with enhanced sensitivity
const enhancedTagPatterns = {
  ...{
    reflection: {
      primary: ['journaling', 'realized', 'reflecting', 'introspective', 'processing'],
      secondary: ['thinking', 'pondering', 'considering', 'contemplating', 'ruminating'],
      contextual: ['insight', 'epiphany', 'understanding', 'clarity', 'perspective', 'self-awareness'],
      phrases: [/i've been thinking about/gi, /it occurred to me/gi, /i realized that/gi, /processing this/gi],
      neurodivergent_friendly: ['special interest deep dive', 'pattern recognition', 'systematic analysis']
    },
    work: {
      primary: ['deadline', 'meeting', 'project', 'client', 'boss'],
      secondary: ['email', 'task', 'office', 'colleague', 'presentation'],
      contextual: ['professional', 'career', 'business', 'workplace', 'conference'],
      phrases: [/work meeting/gi, /at the office/gi, /project deadline/gi, /work related/gi],
      accommodations: ['remote work', 'flexible schedule', 'quiet workspace', 'task breakdown']
    },
    colton: {
      primary: ['colton', 'son', 'kiddo'],
      secondary: ['school dropoff', 'bedtime', 'kindergarten', 'pajamas'],
      contextual: ['parenting', 'daddy time', 'kid activities', 'family time', 'neurodivergent parenting'],
      phrases: [/colton's school/gi, /with colton/gi, /colton said/gi, /my son/gi],
      considerations: ['sensory needs', 'routine importance', 'communication styles']
    }
  },
  // Add neurodivergent and metaphysical patterns
  ...neurodivergentPatterns,
  ...metaphysicalPatterns
};

// Enhanced mood patterns combining original with new categories
const enhancedMoodPatterns = {
  happy: {
    intense: ['ecstatic', 'thrilled', 'overjoyed', 'elated', 'euphoric', 'blissful'],
    moderate: ['happy', 'joyful', 'cheerful', 'content', 'pleased', 'uplifted'],
    mild: ['good', 'okay', 'fine', 'calm', 'peaceful', 'stable'],
    contextual: ['grateful', 'excited', 'cozy', 'satisfied', 'optimistic', 'aligned'],
    phrases: [/feeling great/gi, /so happy/gi, /in a good mood/gi, /feeling blessed/gi, /heart full/gi]
  },
  sad: {
    intense: ['devastated', 'heartbroken', 'depressed', 'miserable', 'despairing', 'grief-stricken'],
    moderate: ['sad', 'down', 'melancholy', 'blue', 'gloomy', 'sorrowful'],
    mild: ['tired', 'drained', 'low energy', 'meh', 'blah', 'subdued'],
    contextual: ['lonely', 'overwhelmed', 'disconnected', 'empty', 'processing loss'],
    phrases: [/feeling down/gi, /really sad/gi, /heavy heart/gi, /emotionally drained/gi, /soul tired/gi]
  },
  // Add neurodivergent-specific moods
  ...neurodivergentMoods,
  // Add metaphysical emotional states
  aligned: {
    intense: ['perfectly aligned', 'in complete flow', 'divinely guided', 'cosmic harmony'],
    moderate: ['aligned', 'in flow', 'on path', 'spiritually connected'],
    mild: ['somewhat aligned', 'finding balance', 'seeking alignment'],
    contextual: ['soul purpose', 'divine timing', 'spiritual flow', 'energetic harmony'],
    phrases: [/in alignment/gi, /on the right path/gi, /divinely guided/gi, /soul calling/gi]
  },
  awakening: {
    intense: ['profound awakening', 'consciousness explosion', 'spiritual breakthrough'],
    moderate: ['awakening', 'expanding consciousness', 'spiritual growth'],
    mild: ['awakening glimpses', 'opening awareness', 'spiritual curiosity'],
    contextual: ['consciousness shift', 'spiritual evolution', 'soul remembering'],
    phrases: [/spiritual awakening/gi, /consciousness expanding/gi, /soul remembering/gi]
  }
};

// Enhanced cluster patterns with additional considerations
const enhancedClusterPatterns = {
  Home: {
    primary: ['home', 'house', 'cleaning', 'chores', 'domestic'],
    secondary: ['dishes', 'laundry', 'cooking', 'groceries', 'maintenance'],
    contextual: ['household', 'family life', 'domestic duties', 'home improvement', 'nesting'],
    phrases: [/around the house/gi, /home life/gi, /household tasks/gi, /sacred space/gi],
    relationships: ['family', 'daily_routine', 'self_care', 'sanctuary'],
    accommodations: ['sensory-friendly spaces', 'organization systems', 'routine structures']
  },
  Neurodivergent_Identity: {
    primary: ['autism', 'adhd', 'neurodivergent', 'neurodiversity', 'different brain'],
    secondary: ['stimming', 'special interests', 'executive function', 'sensory processing'],
    contextual: ['neurodivergent community', 'self-advocacy', 'accommodations', 'masking'],
    phrases: [/neurodivergent experience/gi, /different brain/gi, /neurotypical world/gi],
    relationships: ['identity', 'community', 'self_acceptance', 'advocacy']
  },
  Spiritual_Practice: {
    primary: ['meditation', 'prayer', 'ritual', 'ceremony', 'spiritual practice'],
    secondary: ['altar', 'crystal', 'sage', 'tarot', 'oracle cards'],
    contextual: ['sacred space', 'divine connection', 'spiritual tools', 'energy work'],
    phrases: [/spiritual practice/gi, /sacred ritual/gi, /divine connection/gi, /energy work/gi],
    relationships: ['growth', 'healing', 'consciousness', 'alignment']
  },
  Energy_Management: {
    primary: ['energy management', 'spoon theory', 'battery levels', 'capacity'],
    secondary: ['recharging', 'depleted', 'conserving energy', 'pacing'],
    contextual: ['sustainable living', 'boundary setting', 'energy hygiene'],
    phrases: [/running on empty/gi, /need to recharge/gi, /energy levels/gi, /spoon theory/gi],
    relationships: ['self_care', 'boundaries', 'sustainability', 'wellness']
  }
};

// Multi-dimensional analysis function
function analyzeWithDiversity(content, patterns, analysisType = 'general') {
  const results = [];
  const lowerContent = content.toLowerCase();
  
  Object.entries(patterns).forEach(([category, data]) => {
    let score = 0;
    let matches = [];
    let intensity = 'mild';
    let culturalContext = [];
    
    // Enhanced weight system for different perspectives
    const levels = { 
      primary: 3, 
      secondary: 2, 
      contextual: 1.5, 
      mild: 1, 
      moderate: 2, 
      intense: 3,
      neurodivergent_friendly: 2.5,
      accommodations: 2,
      considerations: 1.5
    };
    
    Object.entries(data).forEach(([level, keywords]) => {
      if (Array.isArray(keywords)) {
        keywords.forEach(keyword => {
          if (
  keyword &&
  typeof keyword === 'string' &&
  typeof keyword.toLowerCase === 'function' &&
  lowerContent.includes(keyword.toLowerCase())
) {

            const weight = levels[level] || 1;
            score += weight;
            matches.push({ 
              keyword, 
              level, 
              weight,
              culturalContext: level.includes('neurodivergent') || level.includes('metaphysical') ? [level] : []
            });
            
            // Enhanced intensity detection
            if (level === 'intense') intensity = 'intense';
            else if (level === 'moderate' && intensity !== 'intense') intensity = 'moderate';
            
            // Track cultural contexts
            if (level.includes('neurodivergent') || level.includes('accommodations')) {
              culturalContext.push('neurodivergent');
            }
            if (level.includes('metaphysical') || level.includes('spiritual')) {
              culturalContext.push('metaphysical');
            }
          }
        });
      } else if (level === 'phrases' && Array.isArray(keywords)) {
        keywords.forEach(phrase => {
          const phraseMatches = content.match(phrase);
          if (phraseMatches) {
            score += 2.5;
            matches.push({ 
              phrase: phrase.source, 
              level: 'phrase', 
              weight: 2.5,
              culturalContext: []
            });
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

// Enhanced context analysis with processing styles
function analyzeEnhancedContext(content) {
  const context = {
    timeOfDay: null,
    activityType: null,
    emotionalIntensity: 'low',
    themes: [],
    processingStyle: [],
    neurodivergentMarkers: [],
    metaphysicalElements: [],
    energyLevel: 'neutral',
    communicationStyle: 'direct'
  };
  
  // Processing style detection
  const styleResults = analyzeWithDiversity(content, processingStyles, 'processing');
  context.processingStyle = styleResults.map(s => s.category);
  
  // Neurodivergent marker detection
  const ndMarkers = [
    /executive function/gi, /sensory/gi, /hyperfocus/gi, /stimming/gi,
    /masking/gi, /meltdown/gi, /shutdown/gi, /special interest/gi
  ];
  context.neurodivergentMarkers = ndMarkers.filter(marker => marker.test(content));
  
  // Metaphysical element detection
  const metaphysicalMarkers = [
    /energy/gi, /vibration/gi, /intuition/gi, /synchronicity/gi,
    /manifestation/gi, /chakra/gi, /moon/gi, /crystal/gi, /spiritual/gi
  ];
  context.metaphysicalElements = metaphysicalMarkers.filter(marker => marker.test(content));
  
  // Energy level assessment
  const energyWords = {
    high: ['energized', 'vibrant', 'excited', 'motivated', 'inspired'],
    low: ['drained', 'tired', 'depleted', 'exhausted', 'overwhelmed'],
    balanced: ['centered', 'grounded', 'stable', 'calm', 'peaceful']
  };
  
  Object.entries(energyWords).forEach(([level, words]) => {
    if (words.some(word => content.toLowerCase().includes(word))) {
      context.energyLevel = level;
    }
  });
  
  // Communication style assessment
  if (content.includes('...') || content.includes('maybe') || content.includes('perhaps')) {
    context.communicationStyle = 'indirect';
  } else if (content.includes('!') || content.match(/\b(definitely|absolutely|clearly)\b/gi)) {
    context.communicationStyle = 'emphatic';
  }
  
  return context;
}

// Accessibility-focused confidence calculation
function calculateInclusiveConfidence(results, content) {
  const wordCount = content.split(/\s+/).length;
  const baseConfidence = Math.min(wordCount / 30, 1); // Lower threshold for confidence
  
  return results.map(result => {
    // Boost confidence for marginalized perspectives
    let diversityBoost = 0;
    if (result.culturalContext.includes('neurodivergent')) diversityBoost += 0.1;
    if (result.culturalContext.includes('metaphysical')) diversityBoost += 0.1;
    
    return {
      ...result,
      adjustedConfidence: Math.min((result.confidence + baseConfidence + diversityBoost) / 2, 1),
      accessibilityScore: result.accommodations ? result.accommodations.length * 0.1 : 0
    };
  });
}

// Main enhanced function
export function suggestMetadata(content) {
  if (!content || typeof content !== 'string') {
    return { 
      tags: [], 
      moods: [], 
      clusters: [], 
      confidence: 0, 
      context: null,
      accessibility: { processingStyles: [], accommodations: [] },
      diversity: { perspectives: [], culturalContexts: [] }
    };
  }
  
  // Analyze all enhanced pattern types
  const tagResults = analyzeWithDiversity(content, enhancedTagPatterns, 'tags');
  const moodResults = analyzeWithDiversity(content, enhancedMoodPatterns, 'moods');
  const clusterResults = analyzeWithDiversity(content, enhancedClusterPatterns, 'clusters');
  const context = analyzeEnhancedContext(content);
  
  // Apply inclusive confidence adjustments
  const adjustedTags = calculateInclusiveConfidence(tagResults, content);
  const adjustedMoods = calculateInclusiveConfidence(moodResults, content);
  const adjustedClusters = calculateInclusiveConfidence(clusterResults, content);
  
  // Lower confidence threshold for inclusivity
  const confidenceThreshold = 0.2;
  const highConfidenceTags = adjustedTags.filter(t => t.adjustedConfidence >= confidenceThreshold);
  const highConfidenceMoods = adjustedMoods.filter(m => m.adjustedConfidence >= confidenceThreshold);
  const highConfidenceClusters = adjustedClusters.filter(c => c.adjustedConfidence >= confidenceThreshold);
  
  // Enhanced relationship and accommodation suggestions
  const relationships = new Set();
  const accommodations = new Set();
  const culturalContexts = new Set();
  
  [...highConfidenceTags, ...highConfidenceClusters].forEach(item => {
    if (item.relationships) item.relationships.forEach(rel => relationships.add(rel));
    if (item.accommodations) item.accommodations.forEach(acc => accommodations.add(acc));
    if (item.culturalContext) item.culturalContext.forEach(ctx => culturalContexts.add(ctx));
  });
  
  return {
    tags: highConfidenceTags.map(t => ({
      name: t.category,
      confidence: t.adjustedConfidence,
      intensity: t.intensity,
      matches: t.matches.length,
      culturalContext: t.culturalContext,
      accommodations: t.accommodations
    })),
    moods: highConfidenceMoods.map(m => ({
      name: m.category,
      confidence: m.adjustedConfidence,
      intensity: m.intensity,
      matches: m.matches.length,
      culturalContext: m.culturalContext
    })),
    clusters: highConfidenceClusters.map(c => ({
      name: c.category,
      confidence: c.adjustedConfidence,
      relationships: c.relationships,
      matches: c.matches.length,
      accommodations: c.accommodations,
      considerations: c.considerations
    })),
    context: {
      ...context,
      accessibility: {
        processingStyles: context.processingStyle,
        communicationStyle: context.communicationStyle,
        energyLevel: context.energyLevel
      },
      diversity: {
        neurodivergentMarkers: context.neurodivergentMarkers.length,
        metaphysicalElements: context.metaphysicalElements.length,
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
        ...highConfidenceTags.map(t => t.adjustedConfidence),
        ...highConfidenceMoods.map(m => m.adjustedConfidence),
        ...highConfidenceClusters.map(c => c.adjustedConfidence),
        0
      ),
      diversityScore: culturalContexts.size * 0.2,
      accessibilityScore: accommodations.size * 0.1,
      inclusivityMetrics: {
        neurodivergentFriendly: context.neurodivergentMarkers.length > 0,
        metaphysicalAware: context.metaphysicalElements.length > 0,
        multipleProcessingStyles: context.processingStyle.length > 1,
        accommodationSuggestions: accommodations.size
      }
    }
    };
}

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

