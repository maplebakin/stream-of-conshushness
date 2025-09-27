// backend/graphql/resolvers.js
import Entry from '../models/Entry.js';
import Task from '../models/Task.js';

import {
  createEntryWithAutomation,
  updateEntryWithAutomation,
  clearRippleArtifacts,
  normalizeDate,
} from '../utils/entryAutomation.js';
import { analyzePriority } from '../utils/suggestMetadata.js';

/* ───────────────── helpers ───────────────── */
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
const toISODateOnly = (val) => normalizeDate(val);

const sortMap = {
  DATE_DESC   : { date: -1, createdAt: -1 },
  DATE_ASC    : { date:  1, createdAt:  1 },
  CREATED_DESC: { createdAt: -1 },
  CREATED_ASC : { createdAt:  1 }
};

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
    const entry = await createEntryWithAutomation({
      userId: context.user.userId,
      payload: input || {},
    });

    return entry;
  },

  /* ─────────── Mutation: updateEntry (returns Entry) ─────────── */
  updateEntry: async ({ id, input }, context) => {
    if (!context.user) throw new Error('Unauthorized');
    const updated = await updateEntryWithAutomation({
      userId: context.user.userId,
      entryId: id,
      updates: input || {},
    });

    if (!updated) throw new Error('Entry not found');

    return updated;
  },

  /* ─────────── Mutation: deleteEntry (returns Boolean) ─────────── */
  deleteEntry: async ({ id }, context) => {
    if (!context.user) throw new Error('Unauthorized');

    const entry = await Entry.findOneAndDelete({ _id: id, userId: context.user.userId });
    if (!entry) return false;

    await clearRippleArtifacts({ userId: context.user.userId, entryId: id });

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
