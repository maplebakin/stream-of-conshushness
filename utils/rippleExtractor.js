// --- Mood, Context, Priority, Time Indicator Patterns (shared & exported) ---

export const moodIndicators = {
  positive: /\b(?:happy|excited|thrilled|amazed|wonderful|fantastic|great|awesome|love|enjoy|delighted|pleased|optimistic|hopeful|grateful|blessed)\b/gi,
  negative: /\b(?:sad|depressed|anxious|worried|stressed|frustrated|angry|annoyed|disappointed|overwhelmed|exhausted|tired|miserable|awful|terrible|hate|regret)\b/gi,
  neutral: /\b(?:okay|fine|normal|usual|regular|standard|typical|average)\b/gi,
  energetic: /\b(?:energetic|motivated|driven|pumped|ready|determined|focused|productive)\b/gi,
  tired: /\b(?:tired|exhausted|drained|weary|sleepy|burnt out|fatigue)\b/gi,
  uncertain: /\b(?:confused|uncertain|unsure|unclear|don't know|not sure|maybe|perhaps|might)\b/gi
};

export const contextTags = {
  work: /\b(?:work|job|office|meeting|project|deadline|boss|colleague|client|business|professional|career)\b/gi,
  personal: /\b(?:family|friend|relationship|personal|home|house|self|myself)\b/gi,
  health: /\b(?:health|doctor|exercise|gym|diet|medical|wellness|fitness|therapy|mental health)\b/gi,
  finance: /\b(?:money|budget|financial|bank|investment|savings|expense|cost|payment|bills)\b/gi,
  education: /\b(?:learn|study|course|class|school|university|education|research|knowledge|skill)\b/gi,
  creative: /\b(?:creative|art|music|writing|design|craft|hobby|project|inspiration)\b/gi,
  social: /\b(?:social|party|event|gathering|friends|community|networking|relationship)\b/gi,
  travel: /\b(?:travel|trip|vacation|journey|visit|destination|flight|hotel)\b/gi,
  technology: /\b(?:tech|technology|software|app|computer|digital|online|internet|coding|programming)\b/gi
};

export const priorityIndicators = {
  high: /\b(?:critical|urgent|important|priority|must|essential|crucial|vital|asap|immediately|right away)\b/gi,
  medium: /\b(?:should|ought to|need to|have to|want to|would like to)\b/gi,
  low: /\b(?:maybe|perhaps|might|could|someday|eventually|when I get around to it)\b/gi
};

export const timeIndicators = {
  immediate: /\b(?:now|today|tonight|this morning|this afternoon|this evening|right now|immediately)\b/gi,
  thisWeek: /\b(?:this week|by friday|before weekend|end of week)\b/gi,
  thisMonth: /\b(?:this month|by month end|before (?:january|february|march|april|may|june|july|august|september|october|november|december))\b/gi,
  someday: /\b(?:someday|eventually|one day|in the future|when I have time)\b/gi
};

// --- Shared helpers ---

export function analyzeMood(text) {
  const moods = [];
  const sentimentScore = { positive: 0, negative: 0, neutral: 0 };
  Object.entries(moodIndicators).forEach(([mood, pattern]) => {
    const matches = text.match(pattern);
    if (matches) {
      moods.push({ mood, intensity: matches.length });
      if (mood === 'positive' || mood === 'energetic') sentimentScore.positive += matches.length;
      else if (mood === 'negative' || mood === 'tired') sentimentScore.negative += matches.length;
      else sentimentScore.neutral += matches.length;
    }
  });
  const dominantSentiment = Object.keys(sentimentScore).reduce((a, b) =>
    sentimentScore[a] > sentimentScore[b] ? a : b
  );
  return { moods, dominantSentiment, sentimentScore };
}

export function analyzePriority(text) {
  for (const [level, pattern] of Object.entries(priorityIndicators)) {
    // reset lastIndex in case regex has global flag and was used before
    pattern.lastIndex = 0;
    if (pattern.test(text)) {
      return level; // return on first (highest) match to avoid lower priorities overwriting
    }
  }
  return 'low';
}

export function analyzeContext(text) {
  const contexts = [];
  for (const [context, pattern] of Object.entries(contextTags)) {
    // ensure no stale lastIndex affects future tests
    pattern.lastIndex = 0;
    if (pattern.test(text)) contexts.push(context);
  }
  return contexts;
}

export function analyzeTimeSensitivity(text) {
  for (const [timing, pattern] of Object.entries(timeIndicators)) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) {
      return timing;
    }
  }
  return 'flexible';
}

export function extractTags(text) {
  const hashtags = (text.match(/#(\w+)/g) || []).map(t => t.slice(1).toLowerCase());
  const contextMatches = Object.entries(contextTags)
    .filter(([_, pattern]) => {
      pattern.lastIndex = 0;
      return pattern.test(text);
    })
    .map(([key]) => key);
  return Array.from(new Set([...hashtags, ...contextMatches]));
}

export function calculateConfidence(match, type, text) {
  let baseConfidence = 0.5;
  if (match[0].includes('need to') || match[0].includes('must')) baseConfidence += 0.3;
  if (match[0].includes('urgent') || match[0].includes('important')) baseConfidence += 0.2;
  if (match[0].includes('maybe') || match[0].includes('might')) baseConfidence -= 0.2;
  const extractedLength = (match[1] || '').trim().length;
  if (extractedLength > 20) baseConfidence += 0.1;
  if (extractedLength < 5) baseConfidence -= 0.2;
  return Math.max(0.1, Math.min(1.0, baseConfidence));
}

// --- Main ripple extraction engine ---

export const extractRipples = (entries) => {
  const ripples = [];

  const patterns = {
    urgentTask: [
      /\b(?:urgent|asap|immediately|right away|quickly)\b.*?\b(?:need to|must|have to)\s+([^.!?]+)/gi,
      /\b(?:need to|must|have to)\s+([^.!?]+?)\s+(?:urgent|asap|immediately|right away|quickly)/gi
    ],
    suggestedTask: [
      /\b(?:I (?:need to|should|have to|want to|gotta)|(?:need to|should|have to|want to|gotta)|remember to|don't forget to)\s+([^.!?]+)/gi,
      /\b(?:probably|maybe|might)\s+(?:should|need to|have to)\s+([^.!?]+)/gi
    ],
    procrastinatedTask: [
      /\b(?:keep putting off|keep avoiding|procrastinating on|still haven't)\s+([^.!?]+)/gi,
      /\b(?:I've been meaning to|been trying to|supposed to)\s+([^.!?]+)/gi
    ],
    recurringTask: [
      /\b(?:every|each)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|day|week|month|year)\s*(?:I|we)?\s*(?:need to|should|have to)?\s*([^.!?]+)/gi
    ],
    appointment: [
      /\b(?:meeting|appointment|call|lunch|dinner)\s+(?:with\s+)?([^.!?]+?)\s+(?:at|on)\s+([^.!?]+)/gi,
      /\b(?:scheduled|booked)\s+([^.!?]+?)\s+(?:for|at|on)\s+([^.!?]+)/gi
    ],
    deadline: [
      /\b(?:due|deadline|expires?)\s+(?:by|on|at)?\s*([^.!?]+)/gi,
      /\b([^.!?]+?)\s+(?:is due|due date|deadline)\s+([^.!?]*)/gi
    ],
    goal: [
      /\b(?:goal|aim|hope|dream|want to achieve|working towards)\s+(?:is to|to)?\s*([^.!?]+)/gi,
      /\b(?:trying to|attempting to|striving to)\s+([^.!?]+)/gi
    ],
    wishlistItem: [
      /\b(?:wish I could|would love to|dream of|hope to)\s+([^.!?]+)/gi,
      /\b(?:someday|eventually|one day)\s+(?:I'll|I will|I want to)\s+([^.!?]+)/gi
    ],
    decision: [
      /\b(?:deciding|considering|thinking about|weighing|contemplating)\s+(?:whether to|if I should)?\s*([^.!?]+)/gi,
      /\b(?:should I|wondering if I should|not sure if I should)\s+([^.!?]+)/gi
    ],
    concern: [
      /\b(?:worried about|concerned about|anxious about|stressed about)\s+([^.!?]+)/gi,
      /\b([^.!?]+?)\s+(?:worries me|concerns me|makes me anxious)/gi
    ],
    gratitude: [
      /\b(?:grateful for|thankful for|appreciate|blessed to have)\s+([^.!?]+)/gi,
      /\b([^.!?]+?)\s+(?:makes me happy|brings joy|grateful for)/gi
    ],
    learning: [
      /\b(?:learning|studying|researching|reading about)\s+([^.!?]+)/gi,
      /\b(?:want to learn|need to understand|curious about)\s+([^.!?]+)/gi
    ],
    habitForming: [
      /\b(?:trying to|working on|building|developing)\s+(?:a habit of|the habit of)?\s*([^.!?]+)/gi,
      /\b(?:want to start|need to start)\s+([^.!?]+?)\s+(?:regularly|daily|weekly)/gi
    ],
    habitBreaking: [
      /\b(?:trying to stop|want to quit|need to stop|cutting back on)\s+([^.!?]+)/gi,
      /\b(?:bad habit|addiction to)\s+([^.!?]+)/gi
    ]
  };

  entries.forEach(entry => {
    const entryMoodAnalysis = analyzeMood(entry.content);

    Object.entries(patterns).forEach(([type, patternList]) => {
      patternList.forEach(pattern => {
        const matches = [...entry.content.matchAll(pattern)];
        matches.forEach(match => {
          const extractedText = (match[1] || match[0]).trim();

          if (extractedText && extractedText.length > 2) {
            const confidence = calculateConfidence(match, type, entry.content);
            const priority = analyzePriority(match[0]);
            const contexts = analyzeContext(entry.content);
            const timeSensitivity = analyzeTimeSensitivity(match[0]);
            const localMood = analyzeMood(match[0]);

            ripples.push({
              sourceEntryId: entry._id,
              extractedText,
              originalContext: match[0].trim(),
              type,
              confidence,
              priority,
              contexts,
              timeSensitivity,
              mood: {
                local: localMood,
                entry: entryMoodAnalysis
              },
              metadata: {
                extractedAt: new Date().toISOString(),
                textLength: extractedText.length,
                hasEmotionalIndicators: localMood.moods.length > 0,
                urgencyWords: (match[0].match(/\b(?:urgent|asap|immediately|critical|important)\b/gi) || []).length
              }
            });
          }
        });
      });
    });

    // Standalone mood indicators without specific tasks
    const moodOnlyMatches = entry.content.match(/\b(?:feeling|felt|I'm|I am)\s+([^.!?]+)/gi);
    if (moodOnlyMatches) {
      moodOnlyMatches.forEach(match => {
        const moodAnalysis = analyzeMood(match);
        if (moodAnalysis.moods.length > 0) {
          ripples.push({
            sourceEntryId: entry._id,
            extractedText: match.trim(),
            originalContext: match.trim(),
            type: 'moodIndicator',
            confidence: 0.7,
            priority: 'low',
            contexts: analyzeContext(entry.content),
            timeSensitivity: 'immediate',
            mood: {
              local: moodAnalysis,
              entry: entryMoodAnalysis
            },
            metadata: {
              extractedAt: new Date().toISOString(),
              isPureMoodIndicator: true
            }
          });
        }
      });
    }
  });

  // Deduplication
  const deduplicateRipples = (ripples) => {
    const uniqueRipples = [];
    const seen = new Map();

    ripples.forEach(ripple => {
      const key = ripple.originalContext.toLowerCase().replace(/\s+/g, ' ').trim();
      if (!seen.has(key)) {
        seen.set(key, ripple);
        uniqueRipples.push(ripple);
      } else {
        // If duplicate, keep the one with higher confidence
        const existing = seen.get(key);
        if (ripple.confidence > existing.confidence) {
          const index = uniqueRipples.findIndex(r => r === existing);
          uniqueRipples[index] = ripple;
          seen.set(key, ripple);
        }
      }
    });

    return uniqueRipples;
  };

  // Sorting by priority/confidence
  const sortRipples = (ripples) => {
    const priorityOrder = { high: 3, medium: 2, low: 1 };
    return ripples.sort((a, b) => {
      const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return b.confidence - a.confidence;
    });
  };

  const uniqueRipples = deduplicateRipples(ripples);
  return sortRipples(uniqueRipples);
};

// --- All-in-one Entry Analyzer ---

export function analyzeEntry(entryText) {
  return {
    tags: extractTags(entryText),
    mood: analyzeMood(entryText).dominantSentiment,
    ripples: extractRipples([{ content: entryText }])
  };
}
