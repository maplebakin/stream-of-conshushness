// This function takes your journal entries and finds potential tasks/appointments
export const extractRipples = (entries) => {
  const ripples = [];
  
  // These are the patterns we look for in your writing
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

  // Go through each entry and look for patterns
  entries.forEach(entry => {
    Object.entries(patterns).forEach(([type, patternList]) => {
      patternList.forEach(pattern => {
        const matches = [...entry.content.matchAll(pattern)];
        matches.forEach(match => {
          let extractedText = match[1]?.trim();
          if (extractedText && extractedText.length > 2) {
            ripples.push({
              sourceEntryId: entry._id,
              extractedText: extractedText,
              originalContext: match[0].trim(),
              type: type,
              confidence: match[0].includes('need to') ? 'high' : 'medium'
            });
          }
        });
      });
    });
  });

  return ripples;
};