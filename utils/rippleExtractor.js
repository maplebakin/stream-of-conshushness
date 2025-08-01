export const extractRipples = (entries) => {
  const ripples = [];

  // Pattern matchers
  const patterns = {
    suggestedTask: [
      /\b(?:I (?:need to|should|have to|want to|gotta)|(?:need to|should|have to|want to|gotta)|remember to|don't forget to)\s+([^.!?]+)/gi,
      /\b(?:probably|maybe|might)\s+(?:should|need to|have to)\s+([^.!?]+)/gi
    ],
    recurringTask: [
      /\b(?:every|each)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|day|week|month|year)\s*(?:I|we)?\s*(?:need to|should|have to)?\s*([^.!?]+)/gi
    ],
    appointment: [
      /\b(?:meeting|appointment|call|lunch|dinner)\s+(?:with\s+)?([^.!?]+?)\s+(?:at|on)\s+([^.!?]+)/gi
    ]
  };

  // Extract matches
  entries.forEach(entry => {
    Object.entries(patterns).forEach(([type, patternList]) => {
      patternList.forEach(pattern => {
        const matches = [...entry.content.matchAll(pattern)];
        matches.forEach(match => {
          if (type === 'recurringTask') {
            const day = match[1]?.trim();
            const task = match[2]?.trim();
            if (task && day) {
              ripples.push({
                sourceEntryId: entry._id,
                extractedText: `${task} (${day})`,
                originalContext: match[0].trim(),
                type,
                confidence: 'high'
              });
            }
          } else {
            const extractedText = match[1]?.trim();
            if (extractedText && extractedText.length > 2) {
              ripples.push({
                sourceEntryId: entry._id,
                extractedText,
                originalContext: match[0].trim(),
                type,
                confidence: match[0].includes('need to') ? 'high' : 'medium'
              });
            }
          }
        });
      });
    });
  });

  // Deduplicate by originalContext
  const seen = new Set();
  const uniqueRipples = ripples.filter(r => {
    if (seen.has(r.originalContext)) return false;
    seen.add(r.originalContext);
    return true;
  });

  return uniqueRipples;
};
