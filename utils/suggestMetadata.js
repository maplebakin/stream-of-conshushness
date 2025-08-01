// Enhanced suggestMetadata.js with contextual analysis and confidence scoring

// Weighted keyword patterns with importance scores
const tagPatterns = {
  reflection: {
    primary: ['journaling', 'realized', 'reflecting', 'introspective', 'processing'],
    secondary: ['thinking', 'pondering', 'considering', 'contemplating'],
    contextual: ['insight', 'epiphany', 'understanding', 'clarity', 'perspective'],
    phrases: [/i've been thinking about/gi, /it occurred to me/gi, /i realized that/gi]
  },
  work: {
    primary: ['deadline', 'meeting', 'project', 'client', 'boss'],
    secondary: ['email', 'task', 'office', 'colleague', 'presentation'],
    contextual: ['professional', 'career', 'business', 'workplace', 'conference'],
    phrases: [/work meeting/gi, /at the office/gi, /project deadline/gi, /work related/gi]
  },
  colton: {
    primary: ['colton', 'son', 'kiddo'],
    secondary: ['school dropoff', 'bedtime', 'kindergarten', 'pajamas'],
    contextual: ['parenting', 'daddy time', 'kid activities', 'family time'],
    phrases: [/colton's school/gi, /with colton/gi, /colton said/gi, /my son/gi]
  },
  dream: {
    primary: ['dream', 'nightmare', 'lucid dreaming'],
    secondary: ['asleep', 'sleeping', 'subconscious'],
    contextual: ['rem sleep', 'vivid', 'symbolic', 'unconscious'],
    phrases: [/had a dream/gi, /dreamed about/gi, /in my dream/gi, /while sleeping/gi]
  },
  gratitude: {
    primary: ['grateful', 'thankful', 'blessed', 'appreciative'],
    secondary: ['appreciate', 'counting blessings', 'fortunate'],
    contextual: ['mindfulness', 'positive mindset', 'abundance'],
    phrases: [/grateful for/gi, /thankful that/gi, /feel blessed/gi, /appreciate having/gi]
  },
  health: {
    primary: ['therapy', 'mental health', 'wellness', 'exercise'],
    secondary: ['doctor', 'meditation', 'self-care', 'healing'],
    contextual: ['mindfulness', 'recovery', 'growth', 'balance'],
    phrases: [/therapy session/gi, /mental health/gi, /taking care of myself/gi]
  },
  finance: {
    primary: ['budget', 'money', 'expenses', 'financial'],
    secondary: ['bills', 'savings', 'spending', 'income'],
    contextual: ['investment', 'debt', 'financial planning'],
    phrases: [/tight budget/gi, /money worries/gi, /financial stress/gi]
  },
  creativity: {
    primary: ['creative', 'art', 'writing', 'music'],
    secondary: ['inspiration', 'artistic', 'crafting', 'design'],
    contextual: ['expression', 'imagination', 'innovative'],
    phrases: [/creative project/gi, /artistic expression/gi, /inspired to create/gi]
  },
  social: {
    primary: ['friends', 'social', 'party', 'gathering'],
    secondary: ['conversation', 'community', 'connection', 'relationship'],
    contextual: ['networking', 'socializing', 'bonding'],
    phrases: [/hanging out/gi, /social event/gi, /catching up with/gi]
  }
};

// Enhanced mood detection with intensity and context
const moodPatterns = {
  happy: {
    intense: ['ecstatic', 'thrilled', 'overjoyed', 'elated', 'euphoric'],
    moderate: ['happy', 'joyful', 'cheerful', 'content', 'pleased'],
    mild: ['good', 'okay', 'fine', 'calm', 'peaceful'],
    contextual: ['grateful', 'excited', 'cozy', 'satisfied', 'optimistic'],
    phrases: [/feeling great/gi, /so happy/gi, /in a good mood/gi, /feeling blessed/gi]
  },
  sad: {
    intense: ['devastated', 'heartbroken', 'depressed', 'miserable', 'despairing'],
    moderate: ['sad', 'down', 'melancholy', 'blue', 'gloomy'],
    mild: ['tired', 'drained', 'low energy', 'meh', 'blah'],
    contextual: ['lonely', 'overwhelmed', 'disconnected', 'empty'],
    phrases: [/feeling down/gi, /really sad/gi, /heavy heart/gi, /emotionally drained/gi]
  },
  angry: {
    intense: ['furious', 'enraged', 'livid', 'seething', 'irate'],
    moderate: ['angry', 'mad', 'pissed', 'irritated', 'annoyed'],
    mild: ['bothered', 'mildly frustrated', 'slightly annoyed'],
    contextual: ['frustrated', 'resentful', 'bitter', 'hostile'],
    phrases: [/so angry/gi, /really frustrated/gi, /pissed off/gi, /had enough/gi]
  },
  anxious: {
    intense: ['panicked', 'terrified', 'overwhelmed with anxiety', 'paralyzed'],
    moderate: ['anxious', 'worried', 'stressed', 'nervous', 'uneasy'],
    mild: ['slightly worried', 'a bit nervous', 'concerned'],
    contextual: ['restless', 'on edge', 'tense', 'apprehensive'],
    phrases: [/really anxious/gi, /stressed out/gi, /worry about/gi, /anxiety attack/gi]
  },
  excited: {
    intense: ['thrilled', 'ecstatic', 'pumped', 'stoked', 'exhilarated'],
    moderate: ['excited', 'enthusiastic', 'eager', 'energized'],
    mild: ['looking forward', 'interested', 'curious'],
    contextual: ['motivated', 'inspired', 'anticipating'],
    phrases: [/so excited/gi, /can't wait/gi, /really looking forward/gi]
  },
  confused: {
    intense: ['completely lost', 'utterly confused', 'bewildered'],
    moderate: ['confused', 'puzzled', 'uncertain', 'unclear'],
    mild: ['not sure', 'questioning', 'wondering'],
    contextual: ['ambivalent', 'conflicted', 'indecisive'],
    phrases: [/don't understand/gi, /confused about/gi, /not sure what/gi]
  },
  peaceful: {
    intense: ['blissful', 'serene', 'transcendent', 'deeply peaceful'],
    moderate: ['peaceful', 'calm', 'centered', 'balanced'],
    mild: ['relaxed', 'at ease', 'comfortable'],
    contextual: ['mindful', 'present', 'grounded', 'harmonious'],
    phrases: [/feeling peaceful/gi, /so calm/gi, /inner peace/gi, /centered and grounded/gi]
  }
};

// Enhanced cluster detection with relationship mapping
const clusterPatterns = {
  Home: {
    primary: ['home', 'house', 'cleaning', 'chores', 'domestic'],
    secondary: ['dishes', 'laundry', 'cooking', 'groceries', 'maintenance'],
    contextual: ['household', 'family life', 'domestic duties', 'home improvement'],
    phrases: [/around the house/gi, /home life/gi, /household tasks/gi],
    relationships: ['family', 'daily_routine', 'self_care']
  },
  Colton: {
    primary: ['colton', 'son', 'parenting', 'fatherhood'],
    secondary: ['kindergarten', 'school', 'bedtime', 'playtime'],
    contextual: ['child development', 'family bonding', 'daddy duties'],
    phrases: [/time with colton/gi, /colton's development/gi, /being a dad/gi],
    relationships: ['family', 'personal_growth', 'daily_routine']
  },
  Stream: {
    primary: ['stream', 'coding', 'development', 'programming'],
    secondary: ['entrymodal', 'cluster', 'project', 'software'],
    contextual: ['technology', 'innovation', 'problem solving', 'creativity'],
    phrases: [/working on stream/gi, /coding project/gi, /development work/gi],
    relationships: ['work', 'creativity', 'problem_solving']
  },
  Self: {
    primary: ['therapy', 'self-care', 'personal growth', 'introspection'],
    secondary: ['journaling', 'meditation', 'reflection', 'insight'],
    contextual: ['mindfulness', 'healing', 'self-discovery', 'mental health'],
    phrases: [/working on myself/gi, /personal development/gi, /self reflection/gi],
    relationships: ['health', 'growth', 'spirituality']
  },
  Work: {
    primary: ['work', 'career', 'professional', 'job'],
    secondary: ['meeting', 'project', 'deadline', 'colleague'],
    contextual: ['productivity', 'leadership', 'business', 'goals'],
    phrases: [/at work/gi, /work project/gi, /professional development/gi],
    relationships: ['goals', 'stress', 'achievement']
  },
  Relationships: {
    primary: ['relationship', 'friendship', 'connection', 'social'],
    secondary: ['friend', 'partner', 'family', 'communication'],
    contextual: ['intimacy', 'trust', 'support', 'love'],
    phrases: [/relationship with/gi, /connecting with/gi, /social interaction/gi],
    relationships: ['emotional', 'support', 'growth']
  }
};

// Activity and time-based patterns
const activityPatterns = {
  morning: [/morning/gi, /woke up/gi, /coffee/gi, /breakfast/gi, /start of day/gi],
  evening: [/evening/gi, /dinner/gi, /winding down/gi, /end of day/gi, /nighttime/gi],
  routine: [/daily routine/gi, /habit/gi, /regularly/gi, /every day/gi, /consistent/gi],
  transition: [/changing/gi, /transition/gi, /moving from/gi, /shift/gi, /adjustment/gi]
};

// Enhanced analysis functions
function analyzePatterns(content, patterns) {
  const results = [];
  const lowerContent = content.toLowerCase();
  
  Object.entries(patterns).forEach(([category, data]) => {
    let score = 0;
    let matches = [];
    let intensity = 'mild';
    
    // Check different levels of keywords
    const levels = { primary: 3, secondary: 2, contextual: 1.5, mild: 1, moderate: 2, intense: 3 };
    
    Object.entries(data).forEach(([level, keywords]) => {
      if (Array.isArray(keywords)) {
        keywords.forEach(keyword => {
          if (lowerContent.includes(keyword.toLowerCase())) {
            score += levels[level] || 1;
            matches.push({ keyword, level, weight: levels[level] || 1 });
            if (level === 'intense') intensity = 'intense';
            else if (level === 'moderate' && intensity !== 'intense') intensity = 'moderate';
          }
        });
      } else if (level === 'phrases' && Array.isArray(keywords)) {
        keywords.forEach(phrase => {
          const phraseMatches = content.match(phrase);
          if (phraseMatches) {
            score += 2.5; // Phrases get higher weight
            matches.push({ phrase: phrase.source, level: 'phrase', weight: 2.5 });
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
        confidence: Math.min(score / 5, 1), // Normalized confidence score
        relationships: data.relationships || []
      });
    }
  });
  
  return results.sort((a, b) => b.score - a.score);
}

function analyzeContext(content) {
  const context = {
    timeOfDay: null,
    activityType: null,
    emotionalIntensity: 'low',
    themes: []
  };
  
  // Time context
  Object.entries(activityPatterns).forEach(([time, patterns]) => {
    patterns.forEach(pattern => {
      if (pattern.test(content)) {
        context.timeOfDay = time;
      }
    });
  });
  
  // Emotional intensity based on language
  const intensityWords = content.match(/\b(very|extremely|incredibly|absolutely|completely|totally|really|so|deeply)\b/gi);
  if (intensityWords && intensityWords.length > 2) context.emotionalIntensity = 'high';
  else if (intensityWords && intensityWords.length > 0) context.emotionalIntensity = 'medium';
  
  return context;
}

function calculateConfidence(results, content) {
  const wordCount = content.split(/\s+/).length;
  const baseConfidence = Math.min(wordCount / 50, 1); // More words = higher base confidence
  
  return results.map(result => ({
    ...result,
    adjustedConfidence: Math.min((result.confidence + baseConfidence) / 2, 1)
  }));
}

export function suggestMetadata(content) {
  if (!content || typeof content !== 'string') {
    return { tags: [], moods: [], clusters: [], confidence: 0, context: null };
  }
  
  // Analyze all pattern types
  const tagResults = analyzePatterns(content, tagPatterns);
  const moodResults = analyzePatterns(content, moodPatterns);
  const clusterResults = analyzePatterns(content, clusterPatterns);
  const context = analyzeContext(content);
  
  // Apply confidence adjustments
  const adjustedTags = calculateConfidence(tagResults, content);
  const adjustedMoods = calculateConfidence(moodResults, content);
  const adjustedClusters = calculateConfidence(clusterResults, content);
  
  // Filter by confidence threshold
  const confidenceThreshold = 0.3;
  const highConfidenceTags = adjustedTags.filter(t => t.adjustedConfidence >= confidenceThreshold);
  const highConfidenceMoods = adjustedMoods.filter(m => m.adjustedConfidence >= confidenceThreshold);
  const highConfidenceClusters = adjustedClusters.filter(c => c.adjustedConfidence >= confidenceThreshold);
  
  // Extract relationship suggestions
  const relationships = new Set();
  [...highConfidenceTags, ...highConfidenceClusters].forEach(item => {
    if (item.relationships) {
      item.relationships.forEach(rel => relationships.add(rel));
    }
  });
  
  return {
    tags: highConfidenceTags.map(t => ({
      name: t.category,
      confidence: t.adjustedConfidence,
      intensity: t.intensity,
      matches: t.matches.length
    })),
    moods: highConfidenceMoods.map(m => ({
      name: m.category,
      confidence: m.adjustedConfidence,
      intensity: m.intensity,
      matches: m.matches.length
    })),
    clusters: highConfidenceClusters.map(c => ({
      name: c.category,
      confidence: c.adjustedConfidence,
      relationships: c.relationships,
      matches: c.matches.length
    })),
    context,
    suggestedRelationships: Array.from(relationships),
    metadata: {
      analyzedAt: new Date().toISOString(),
      contentLength: content.length,
      wordCount: content.split(/\s+/).length,
      overallConfidence: Math.max(
        ...highConfidenceTags.map(t => t.adjustedConfidence),
        ...highConfidenceMoods.map(m => m.adjustedConfidence),
        ...highConfidenceClusters.map(c => c.adjustedConfidence),
        0
      )
    }
  };
}