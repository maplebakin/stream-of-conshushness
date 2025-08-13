// backend/graphql/resolvers.js
import Entry          from '../models/Entry.js';
import Ripple         from '../models/Ripple.js';
import Task           from '../models/Task.js';
import SuggestedTask  from '../models/SuggestedTask.js';

import analyzeEntry from '../utils/analyzeEntry.js';
import { extractEntrySuggestions, extractRipples } from '../utils/rippleExtractor.js';
import { analyzePriority } from '../utils/suggestMetadata.js';

/* ───────────────── helpers ───────────────── */
const deDupeTags = (raw) => {
  const arr = Array.isArray(raw) ? raw : raw == null ? [] : String(raw).split(',').map(s => s.trim());
  return [...new Set(arr.filter(Boolean).map(s => s.toLowerCase()))];
};

function torontoTodayISO() {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric', month: '2-digit', day: '2-digit'
  });
  const parts = fmt.formatToParts(new Date());
  const y = parts.find(p => p.type === 'year')?.value || '0000';
  const m = parts.find(p => p.type === 'month')?.value || '01';
  const d = parts.find(p => p.type === 'day')?.value || '01';
  return `${y}-${m}-${d}`;
}
function toISODateOnly(val) {
  if (!val) return torontoTodayISO();
  if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
  const d = new Date(val);
  if (Number.isNaN(+d)) return torontoTodayISO();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
const stripHTML = (s = '') => String(s).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const plainFrom = ({ text, html, content }) => {
  if (typeof text === 'string' && text.trim()) return text.trim();
  const src = (typeof content === 'string' && content.trim()) ? content :
              (typeof html === 'string' && html.trim()) ? html : '';
  return stripHTML(src);
};

const sortMap = {
  DATE_DESC   : { date: -1, createdAt: -1 },
  DATE_ASC    : { date:  1, createdAt:  1 },
  CREATED_DESC: { createdAt: -1 },
  CREATED_ASC : { createdAt:  1 }
};

async function safeDeleteSuggestedTasks(filter) {
  try {
    if (SuggestedTask && typeof SuggestedTask.deleteMany === 'function') {
      await SuggestedTask.deleteMany(filter);
    }
  } catch (e) {
    console.warn('⚠️ SuggestedTask cleanup skipped:', e.message);
  }
}

/* recompute suggestions (non-blocking safety) */
function computeSuggestionsDraft({ _id, text, html, content, date }) {
  const analysisContent = content?.trim?.() ? content : (html?.trim?.() ? html : text);
  let analyzed = { tags: [], contexts: [], confidence: 0 };
  try { analyzed = analyzeEntry(analysisContent); } catch {}
  let suggestions = {
    suggestedTasks: [], suggestedAppointments: [], suggestedEvents: [],
    suggestedTags: [], suggestedClusters: []
  };
  try {
    suggestions = extractEntrySuggestions({ _id, text, html, content: analysisContent, date }) || suggestions;
  } catch {}
  return { analyzed, suggestions };
}

/* entry preview mapper (for Task.query includeEntries) */
const previewOf = (e) => {
  if (!e) return null;
  const text = (e.text && e.text.trim()) || '';
  const content = (e.content && e.content.trim()) || '';
  const preview = (text || content).replace(/\s+/g, ' ').slice(0, 140);
  return { _id: e._id, date: e.date || torontoTodayISO(), preview };
};

/* ───────────────── resolvers ───────────────── */
const root = {
  /* ─────────── Query: entry ─────────── */
  entry: async ({ id }, context) => {
    if (!context.user) throw new Error('Unauthorized');
    return Entry.findOne({ _id: id, userId: context.user.userId });
  },

  /* ─────────── Query: entries ─────────── */
  entries: async (args, context) => {
    if (!context.user) throw new Error('Unauthorized');

    const {
      section, date, cluster,
      dateFrom, dateTo, tagIn, q,
      sort = 'DATE_DESC', limit = 50, offset = 0
    } = args || {};

    const filter = { userId: context.user.userId };

    if (section) filter.section = section;
    if (cluster) filter.cluster = cluster;
    if (date)    filter.date    = date;

    if (dateFrom || dateTo) {
      filter.date = filter.date || {};
      if (dateFrom) filter.date.$gte = toISODateOnly(dateFrom);
      if (dateTo)   filter.date.$lte = toISODateOnly(dateTo);
    }

    if (Array.isArray(tagIn) && tagIn.length) {
      filter.tags = { $in: tagIn.map(String) };
    }

    if (q && String(q).trim()) {
      const rx = new RegExp(String(q).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [
        { text: rx },
        { content: rx },
        { html: rx },
        { mood: rx },
        { tags: rx }
      ];
    }

    const cursor = Entry.find(filter).sort(sortMap[sort] || sortMap.DATE_DESC).skip(offset).limit(Math.max(1, Math.min(200, limit)));
    return cursor;
  },

  /* ─────────── Query: tasks (with entry previews) ─────────── */
  tasks: async ({ completed, cluster, date, includeEntries = false, limit = 50, offset = 0 }, ctx) => {
    if (!ctx.user) throw new Error('Unauthorized');

    const q = { userId: ctx.user.userId };
    if (typeof completed === 'boolean') q.completed = completed;
    if (cluster) q.clusters = new RegExp(`^${String(cluster).toLowerCase()}$`, 'i');
    if (date) q.dueDate = String(date);

    let query = Task.find(q).sort({ completed: 1, dueDate: 1, createdAt: -1 }).skip(offset).limit(Math.max(1, Math.min(200, limit)));

    if (includeEntries) {
      query = query.populate('sourceEntryId', 'date text content').populate('linkedEntryIds', 'date text content');
    }

    const docs = await query.lean();

    if (!includeEntries) return docs;

    return docs.map(t => ({
      ...t,
      sourceEntry: t.sourceEntryId ? previewOf(t.sourceEntryId) : null,
      linkedEntries: Array.isArray(t.linkedEntryIds) ? t.linkedEntryIds.map(previewOf) : [],
    }));
  },

  /* ─────────── Mutation: createEntry (returns Entry) ─────────── */
  createEntry: async ({ input }, context) => {
    if (!context.user) throw new Error('Unauthorized');

    // Normalize incoming fields
    const safeDate     = toISODateOnly(input?.date);
    const safeText     = plainFrom({ text: input?.text, html: input?.html, content: input?.content });
    const safeHTML     = typeof input?.html === 'string' ? input.html : '';
    const safeContent  = typeof input?.content === 'string' ? input.content : safeHTML;
    const safeTagsIn   = deDupeTags(input?.tags);

    // Suggestions + analyzer tags (non-blocking)
    const { analyzed, suggestions } = computeSuggestionsDraft({
      _id: null, text: safeText, html: safeHTML, content: safeContent, date: safeDate
    });
    const mergedTags = deDupeTags([...(safeTagsIn || []), ...(analyzed.tags || [])]);

    const entry = await new Entry({
      userId : context.user.userId,
      date   : safeDate,
      text   : safeText,
      html   : safeHTML,
      content: safeContent,
      mood   : input?.mood || '',
      cluster: input?.cluster || '',
      section: input?.section || '',
      tags   : mergedTags,
      linkedGoal: input?.linkedGoal ?? null,
      suggestedTasks: Array.isArray(suggestions.suggestedTasks) ? suggestions.suggestedTasks.slice(0,25) : []
    }).save();

    // Generate ripples + conservative auto-approvals
    const extracted = (() => {
      try { return extractRipples([entry.toObject()]); } catch { return []; }
    })();

    const autoRipples = extracted.filter(r =>
      (r.priority === 'high' || r.timeSensitivity === 'immediate') &&
      (r.confidence ?? 0) >= 0.85
    ).slice(0, 5);

    const manualRipples = extracted.filter(r => !autoRipples.includes(r));

    // Auto-create Tasks for the auto group
    for (const r of autoRipples) {
      const task = await new Task({
        userId  : context.user.userId,
        title   : r.extractedText || 'Untitled task',
        priority: r.priority || 'high',
        clusters: r.assignedClusters && r.assignedClusters.length ? r.assignedClusters : (r.assignedCluster ? [r.assignedCluster] : []),
        dueDate : r.dueDate ? toISODateOnly(r.dueDate) : undefined,
        repeat  : r.recurrence || undefined,
        sourceRippleId: undefined,
        sourceEntryId : entry._id
      }).save();
      r.status        = 'approved';
      r.createdTaskId = task._id;
    }

    // Persist ripples
    const rippleDocs = [];
    for (const r of [...autoRipples, ...manualRipples]) {
      rippleDocs.push(await new Ripple({
        userId       : context.user.userId,
        sourceEntryId: entry._id,
        entryDate    : entry.date,
        contexts     : Array.isArray(r.contexts) ? r.contexts : [],
        ...r
      }).save());
    }

    // Mirror pending task-like ripples to SuggestedTask (UI review queue)
    for (const rip of rippleDocs) {
      const isTasky = ['urgentTask','suggestedTask','procrastinatedTask','recurringTask','deadline'].includes(rip.type);
      if (rip.status !== 'approved' && isTasky) {
        await SuggestedTask.create({
          userId        : rip.userId,
          sourceRippleId: rip._id,
          title         : rip.extractedText || 'Untitled task',
          priority      : rip.priority || 'low',
          dueDate       : rip.dueDate ? toISODateOnly(rip.dueDate) : undefined,
          repeat        : rip.recurrence || undefined,
          cluster       : rip.assignedCluster || null
        });
      }
    }

    return entry;
  },

  /* ─────────── Mutation: updateEntry (returns Entry) ─────────── */
  updateEntry: async ({ id, input }, context) => {
    if (!context.user) throw new Error('Unauthorized');

    const entry = await Entry.findOne({ _id: id, userId: context.user.userId });
    if (!entry) throw new Error('Entry not found');

    // Apply incoming fields
    if ('date' in input)    entry.date    = toISODateOnly(input.date);
    if ('text' in input || 'html' in input || 'content' in input) {
      const nextText    = 'text'    in input ? input.text    : entry.text;
      const nextHTML    = 'html'    in input ? input.html    : entry.html;
      const nextContent = 'content' in input ? input.content : entry.content;
      entry.text    = plainFrom({ text: nextText, html: nextHTML, content: nextContent });
      entry.html    = typeof nextHTML === 'string' ? nextHTML : '';
      entry.content = typeof nextContent === 'string' ? nextContent : entry.html;
    }
    if ('mood' in input)       entry.mood    = input.mood || '';
    if ('cluster' in input)    entry.cluster = input.cluster || '';
    if ('section' in input)    entry.section = input.section || '';
    if ('linkedGoal' in input) entry.linkedGoal = input.linkedGoal ?? null;
    if ('tags' in input)       entry.tags = deDupeTags(input.tags);

    // Recompute suggestions if core content changed
    const coreChanged = ('text' in input) || ('html' in input) || ('content' in input) || ('date' in input);
    if (coreChanged) {
      const { analyzed, suggestions } = computeSuggestionsDraft({
        _id: entry._id, text: entry.text, html: entry.html, content: entry.content, date: entry.date
      });
      entry.tags = deDupeTags([...(entry.tags || []), ...(analyzed.tags || [])]);
      entry.suggestedTasks = Array.isArray(suggestions.suggestedTasks) ? suggestions.suggestedTasks.slice(0,25) : [];
    }

    const updated = await entry.save();

    /* refresh ripples & suggested tasks based on this entry */
    const oldRipples = await Ripple.find({ sourceEntryId: id, userId: context.user.userId }).select('_id');
    const oldRippleIds = oldRipples.map(r => r._id);
    await safeDeleteSuggestedTasks({ userId: context.user.userId, sourceRippleId: { $in: oldRippleIds } });
    await Ripple.deleteMany({ sourceEntryId: id, userId: context.user.userId });

    const extracted = (() => {
      try { return extractRipples([updated.toObject()]); } catch { return []; }
    })();

    const autoRipples = extracted.filter(r =>
      (r.priority === 'high' || r.timeSensitivity === 'immediate') &&
      (r.confidence ?? 0) >= 0.85
    ).slice(0, 5);

    const manualRipples = extracted.filter(r => !autoRipples.includes(r));

    for (const r of autoRipples) {
      const task = await new Task({
        userId  : context.user.userId,
        title   : r.extractedText || 'Untitled task',
        priority: r.priority || 'high',
        clusters: r.assignedClusters && r.assignedClusters.length ? r.assignedClusters : (r.assignedCluster ? [r.assignedCluster] : []),
        dueDate : r.dueDate ? toISODateOnly(r.dueDate) : undefined,
        repeat  : r.recurrence || undefined,
        sourceRippleId: undefined,
        sourceEntryId : updated._id
      }).save();
      r.status        = 'approved';
      r.createdTaskId = task._id;
    }

    const rippleDocs = [];
    for (const r of [...autoRipples, ...manualRipples]) {
      rippleDocs.push(await new Ripple({
        userId       : context.user.userId,
        sourceEntryId: updated._id,
        entryDate    : updated.date,
        contexts     : Array.isArray(r.contexts) ? r.contexts : [],
        ...r
      }).save());
    }

    for (const rip of rippleDocs) {
      const isTasky = ['urgentTask','suggestedTask','procrastinatedTask','recurringTask','deadline'].includes(rip.type);
      if (rip.status !== 'approved' && isTasky) {
        await SuggestedTask.create({
          userId        : rip.userId,
          sourceRippleId: rip._id,
          title         : rip.extractedText || 'Untitled task',
          priority      : rip.priority || 'low',
          dueDate       : rip.dueDate ? toISODateOnly(rip.dueDate) : undefined,
          repeat        : rip.recurrence || undefined,
          cluster       : rip.assignedCluster || null
        });
      }
    }

    return updated;
  },

  /* ─────────── Mutation: deleteEntry (returns Boolean) ─────────── */
  deleteEntry: async ({ id }, context) => {
    if (!context.user) throw new Error('Unauthorized');

    const entry = await Entry.findOneAndDelete({ _id: id, userId: context.user.userId });
    if (!entry) return false;

    // cascade cleanup
    const ripples = await Ripple.find({ sourceEntryId: id, userId: context.user.userId }).select('_id');
    const rippleIds = ripples.map(r => r._id);
    await safeDeleteSuggestedTasks({ userId: context.user.userId, sourceRippleId: { $in: rippleIds } });
    await Ripple.deleteMany({ sourceEntryId: id, userId: context.user.userId });

    return true;
  },

  /* ─────────── Mutation: promoteSuggestedTasks ─────────── */
  promoteSuggestedTasks: async ({ entryId, indices }, context) => {
    if (!context.user) throw new Error('Unauthorized');

    const entry = await Entry.findOne({ _id: entryId, userId: context.user.userId });
    if (!entry) throw new Error('Entry not found');

    const list = Array.isArray(entry.suggestedTasks) ? entry.suggestedTasks : [];
    if (!list.length) return [];

    const allNew = list
      .map((t, i) => ({ t, i }))
      .filter(({ t }) => (t?.status || 'new').toLowerCase() === 'new');

    const chosen = Array.isArray(indices) && indices.length
      ? [...new Set(indices)].sort((a, b) => a - b).map(i => ({ t: list[i], i }))
          .filter(({ t, i }) => t && i >= 0 && i < list.length)
      : allNew;

    if (!chosen.length) return [];

    const results = [];
    for (const { t, i } of chosen) {
      const title = (t?.title || '').toString().trim() || 'Untitled task';
      const clusters = t?.cluster ? [t.cluster] : [];
      const dueDate  = t?.dueDate ? toISODateOnly(t.dueDate) : undefined;
      const repeat   = t?.repeat || undefined;

      let priority = 'low';
      try { priority = analyzePriority(title) || 'low'; } catch {}

      const existing = await Task.findOne({
        userId: context.user.userId,
        title,
        dueDate: dueDate || '',
        repeat : repeat  || ''
      });

      if (existing) {
        results.push(existing);
      } else {
        const task = await new Task({
          userId: context.user.userId,
          title,
          priority,
          clusters,
          dueDate,
          repeat,
          sourceEntryId: entry._id
        }).save();
        results.push(task);
      }

      entry.suggestedTasks[i].status = 'accepted';
    }

    await entry.save();
    return results;
  }
};

export default root;
