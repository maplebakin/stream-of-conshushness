// graphql/resolvers.js
import Entry   from '../models/Entry.js';
import Ripple  from '../models/Ripple.js';
import Task    from '../models/Task.js';               // NEW ✔
import { extractRipples } from '../utils/rippleExtractor.js';

const root = {
  /* ─────────── Query: entries ─────────── */
  entries: async ({ section, date }, context) => {
    if (!context.user) throw new Error('Unauthorized');

    const filter = { userId: context.user.userId || context.user._id };
    if (section) filter.section = section;
    if (date)    filter.date    = date;

    const entries = await Entry
      .find(filter)
      .sort({ date: -1, createdAt: -1 });

    return entries;
  },

  /* ─────────── Mutation: createEntry ─────────── */
  createEntry: async ({ input }, context) => {
    if (!context.user) throw new Error('Unauthorized');

    const entry = await new Entry({
      ...input,
      userId: context.user.userId
    }).save();

    /* ----- extract ripples ----- */
    const extracted = extractRipples([entry.toObject()]);

    const autoRipples   = extracted.filter(r => r.priority === 'high' && r.confidence >= 0.8);
    const manualRipples = extracted.filter(r => !autoRipples.includes(r));

    /* auto-create Tasks for qualifying ripples */
    for (const r of autoRipples) {
      const t = await new Task({
        userId  : context.user.userId,
        title   : r.extractedText,
        cluster : r.assignedCluster ?? null,
        priority: r.priority,
        dueDate : r.dueDate    ?? undefined,
        repeat  : r.recurrence ?? undefined
      }).save();

      r.status        = 'approved';
      r.createdTaskId = t._id;
    }

    /* save ALL ripple docs */
    const rippleDocs = [...autoRipples, ...manualRipples].map(r => ({
      ...r,
      userId       : context.user.userId,
      sourceEntryId: entry._id,
      entryDate    : entry.date
    }));

    if (rippleDocs.length) {
      await Ripple.insertMany(rippleDocs, { ordered: false });
      console.log(`🌊 ${rippleDocs.length} ripple(s) saved from entry ${entry._id}`);
    }

    /* match schema: return both entry & ripples */
    return { entry, ripples: rippleDocs };
  },

  /* ─────────── Mutation: updateEntry ─────────── */
  updateEntry: async ({ id, input }, context) => {
    if (!context.user) throw new Error('Unauthorized');

    const entry = await Entry.findOne({ _id: id, userId: context.user.userId });
    if (!entry) throw new Error('Entry not found or unauthorized');

    Object.assign(entry, input);
    const updated = await entry.save();

    /* clear old ripples */
    await Ripple.deleteMany({ sourceEntryId: id, userId: context.user.userId });

    /* re-extract */
    const extracted = extractRipples([updated.toObject()]);
    const autoRipples   = extracted.filter(r => r.priority === 'high' && r.confidence >= 0.8);
    const manualRipples = extracted.filter(r => !autoRipples.includes(r));

    for (const r of autoRipples) {
      const t = await new Task({
        userId  : context.user.userId,
        title   : r.extractedText,
        cluster : r.assignedCluster ?? null,
        priority: r.priority,
        dueDate : r.dueDate    ?? undefined,
        repeat  : r.recurrence ?? undefined
      }).save();

      r.status        = 'approved';
      r.createdTaskId = t._id;
    }

    const rippleDocs = [...autoRipples, ...manualRipples].map(r => ({
      ...r,
      userId       : context.user.userId,
      sourceEntryId: updated._id,
      entryDate    : updated.date
    }));

    if (rippleDocs.length) {
      await Ripple.insertMany(rippleDocs, { ordered: false });
      console.log(`🌊 ${rippleDocs.length} ripple(s) refreshed for entry ${id}`);
    }

    return { entry: updated, ripples: rippleDocs };
  }
};

export default root;
