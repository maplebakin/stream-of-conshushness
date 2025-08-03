// rippleExtractor.js

import {
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
} from './suggestMetadata.js';


// Confidence calculator


export const extractRipples = (entries) => {
  const ripples = [];

  const patterns = {
    urgentTask: [
      /\b(?:urgent|asap|immediately|right away|quickly)\b.*?\b(?:need to|must|have to)\s+([^.!?]+)/gi,
      /\b(?:need to|must|have to)\s+([^.!?]+?)\s+(?:urgent|asap|immediately|right away|quickly)/gi
    ],
    suggestedTask: [
      /\b(?:I (?:need to|should|have to|want to|gotta)|(?:need to|should|have to|want to|gotta)|remember to|don’t forget to)\s+([^.!?]+)/gi,
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

    // Bonus: mood-only ripples
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
    const unique = new Map();
    return ripples.filter(r => {
      const key = r.originalContext.toLowerCase().replace(/\s+/g, ' ').trim();
      if (unique.has(key)) return false;
      unique.set(key, r);
      return true;
    });
  };

  // Priority sorting
  const sortRipples = (ripples) => {
    const order = { high: 3, medium: 2, low: 1 };
    return ripples.sort((a, b) =>
      order[b.priority] - order[a.priority] || b.confidence - a.confidence
    );
  };

  return sortRipples(deduplicateRipples(ripples));
};
export const extractTagsAndClusters = (ripples) => {
  const tags = new Set();
  const clusters = new Set();

  ripples.forEach(ripple => {
    if (ripple.metadata?.extractedTags) {
      ripple.metadata.extractedTags.forEach(tag => tags.add(tag));
    }
    if (ripple.assignedCluster) {
      clusters.add(ripple.assignedCluster);
    }
  });

  return {
    tags: Array.from(tags),
    clusters: Array.from(clusters)
  };
};