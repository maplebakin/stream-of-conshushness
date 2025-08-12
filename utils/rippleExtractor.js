// utils/rippleExtractor.js
import * as chrono from 'chrono-node';
import {
  analyzeMood,
  analyzePriority,
  analyzeContext,
  analyzeTimeSensitivity,
  calculateConfidence
} from './suggestMetadata.js';

/* ---------- helpers ---------- */
const parseDueDate = (text, ref = new Date()) => {
  const res = chrono.parse(text, ref, { forwardDate: true });
  return res?.[0]?.start?.date() ?? null;
};

const parseRecurrence = (text) => {
  const rx = /\bevery\s+(day|week|month|year|monday|tuesday|wednesday|thursday|friday|saturday|sunday)s?\b/i;
  const m  = text.match(rx);
  if (!m) return null;
  const word = m[1].toLowerCase();
  if (['day','week','month','year'].includes(word)) return word; // daily / weekly …
  return 'weekly';                                               // every Monday → weekly
};

/* ---------- patterns ---------- */
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
  /* ... other patterns remain unchanged ... */
};

export const extractRipples = (entries) => {
  const ripples = [];

  entries.forEach(entry => {
    const entryMoodAnalysis = analyzeMood(entry.content);

    Object.entries(patterns).forEach(([type, patternList]) => {
      patternList.forEach(pattern => {
        [...entry.content.matchAll(pattern)].forEach(match => {
          const extractedText = (match[1] ?? match[0]).trim();
          if (extractedText.length < 3) return;

          const confidence      = calculateConfidence(match, type);
          const priority        = analyzePriority(match[0]);
          const contexts        = analyzeContext(entry.content);
          const timeSensitivity = analyzeTimeSensitivity(match[0]);
          const localMood       = analyzeMood(match[0]);

          ripples.push({
            sourceEntryId  : entry._id,
            extractedText,
            originalContext: match[0].trim(),
            type,
            confidence,
            priority,
            contexts,
            timeSensitivity,
            dueDate   : parseDueDate(match[0], new Date(entry.date)),
            recurrence: parseRecurrence(match[0]),
            mood: { local: localMood, entry: entryMoodAnalysis },
            metadata: {
              extractedAt: new Date().toISOString(),
              textLength : extractedText.length,
              hasEmotionalIndicators: localMood.moods.length > 0,
              urgencyWords: (match[0].match(/\b(?:urgent|asap|immediately|critical|important)\b/gi) || []).length
            }
          });
        });
      });
    });

    /* mood-only bonus unchanged */
    const moodOnly = entry.content.match(/\b(?:feeling|felt|I'm|I am)\s+([^.!?]+)/gi);
    moodOnly?.forEach(m => {
      const moodAnalysis = analyzeMood(m);
      if (moodAnalysis.moods.length) {
        ripples.push({
          sourceEntryId: entry._id,
          extractedText: m.trim(),
          originalContext: m.trim(),
          type: 'moodIndicator',
          confidence: 0.7,
          priority: 'low',
          contexts: analyzeContext(entry.content),
          timeSensitivity: 'immediate',
          mood: { local: moodAnalysis, entry: entryMoodAnalysis },
          metadata: { extractedAt: new Date().toISOString(), isPureMoodIndicator: true }
        });
      }
    });
  });

  /* ----- dedupe + sort ----- */
  const dedup = [];
  const seen  = new Set();
  ripples.forEach(r => {
    const key = r.originalContext.toLowerCase().replace(/\s+/g, ' ');
    if (!seen.has(key)) { dedup.push(r); seen.add(key); }
  });
  const order = { high:3, medium:2, low:1 };
  dedup.sort((a, b) => order[b.priority]-order[a.priority] || b.confidence-a.confidence);

  return dedup;
};

/* helper to collect tags / clusters */
export const extractTagsAndClusters = (ripples) => {
  const tags = new Set();
  const clusters = new Set();
  ripples.forEach(r => {
    r.metadata?.extractedTags?.forEach(t => tags.add(t));
    if (r.assignedCluster) clusters.add(r.assignedCluster);
  });
  return { tags:[...tags], clusters:[...clusters] };
};
// utils/rippleExtractor.js (add below your current code or replace exports)

/* ---------- format helpers ---------- */
const tz = 'America/Toronto';
const toISODate = (d) => d ? new Date(d).toISOString().slice(0,10) : undefined;
const toTimeHHmm = (d) => {
  if (!d) return undefined;
  const iso = new Date(d).toISOString(); // UTC HH:mm; fine for MVP
  return iso.slice(11,16);
};

/**
 * Map your flat ripples → entry-scoped suggestion buckets
 * Entry shape expected: { _id, text, createdAt }
 */
export function extractEntrySuggestions(entry) {
  const safeEntry = {
    _id: entry._id,
    content: entry.text ?? entry.content ?? '',
    date: entry.createdAt ?? entry.date ?? new Date().toISOString()
  };

  // reuse your existing extractor
  const flat = extractRipples([safeEntry]) || [];

  const suggestedTasks = [];
  const suggestedAppointments = [];
  const suggestedEvents = [];
  const tagSet = new Set();
  const clusterSet = new Set();

  for (const r of flat) {
    // opportunistically harvest tags/clusters if your analyzers set them
    (r.metadata?.extractedTags || []).forEach(t => tagSet.add(String(t).trim()));
    if (r.assignedCluster) clusterSet.add(String(r.assignedCluster).trim());

    // normalize based on type
    if (r.type === 'appointment') {
      const d = r.dueDate || parseDueDate(r.originalContext, new Date(safeEntry.date));
      const dateStr = toISODate(d);
      const timeStr = toTimeHHmm(d);

      if (dateStr && timeStr) {
        suggestedAppointments.push({
          date: dateStr,               // 'YYYY-MM-DD'
          time: timeStr,               // 'HH:mm'
          details: r.extractedText || r.originalContext,
          cluster: r.assignedCluster,
          confidence: r.confidence ?? 0.6,
          status: 'new'
        });
      }
      continue;
    }

    if (r.type === 'deadline' || r.type === 'urgentTask' || r.type === 'suggestedTask' || r.type === 'procrastinatedTask' || r.type === 'recurringTask') {
      const d = r.dueDate || parseDueDate(r.originalContext, new Date(safeEntry.date));
      suggestedTasks.push({
        title: r.extractedText,
        dueDate: d ? toISODate(d) : undefined,
        repeat: r.recurrence || parseRecurrence(r.originalContext) || undefined,
        cluster: r.assignedCluster,
        confidence: r.confidence ?? 0.6,
        status: 'new'
      });
      continue;
    }

    // lightweight event detection (birthday/anniversary etc.) if your pattern labeled them
    if (r.type === 'event' || r.type === 'importantEvent') {
      const d = r.dueDate || parseDueDate(r.originalContext, new Date(safeEntry.date));
      if (d) {
        suggestedEvents.push({
          name: r.extractedText,
          date: toISODate(d),
          yearly: /\b(birthday|anniversary|every year|annually)\b/i.test(r.originalContext),
          confidence: r.confidence ?? 0.6,
          status: 'new'
        });
      }
      continue;
    }
  }

  // dedupe within buckets (by simple signature)
  const sigSet = new Set();
  const dedupe = (arr, keyFn) => {
    const out = [];
    for (const it of arr) {
      const k = keyFn(it);
      if (!sigSet.has(k)) { sigSet.add(k); out.push(it); }
    }
    return out;
  };

  return {
    suggestedTasks: dedupe(suggestedTasks, t => [t.title, t.dueDate, t.repeat, t.cluster].join('|').toLowerCase()),
    suggestedAppointments: dedupe(suggestedAppointments, a => [a.date, a.time, a.details].join('|').toLowerCase()),
    suggestedEvents: dedupe(suggestedEvents, e => [e.name, e.date, e.yearly].join('|').toLowerCase()),
    suggestedTags: Array.from(tagSet),
    suggestedClusters: Array.from(clusterSet)
  };
}
