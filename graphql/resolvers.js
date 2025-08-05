import Entry          from '../models/Entry.js';
import Ripple         from '../models/Ripple.js';
import Task           from '../models/Task.js';
import SuggestedTask  from '../models/SuggestedTask.js';
import { extractRipples } from '../utils/rippleExtractor.js';

const root = {
  /* ─────────── Query: entries ─────────── */
  entries: async ({ section, date }, context) => {
    if (!context.user) throw new Error('Unauthorized');

    const filter = { userId: context.user.userId };
    if (section) filter.section = section;
    if (date)    filter.date    = date;

    return Entry.find(filter).sort({ date: -1, createdAt: -1 });
  },

  /* ─────────── Mutation: createEntry (returns Entry) ─────────── */
  createEntry: async ({ input }, context) => {
    if (!context.user) throw new Error('Unauthorized');

    const entry = await new Entry({ ...input, userId: context.user.userId }).save();

    /* run extractor → auto-tasks → ripples → suggested-tasks   */
    const extracted = extractRipples([entry.toObject()]);
    const autoRipples   = extracted.filter(r => r.priority === 'high' && r.confidence >= 0.8);
    const manualRipples = extracted.filter(r => !autoRipples.includes(r));

    /* auto-create Tasks */
    for (const r of autoRipples) {
      const t = await new Task({
        userId  : context.user.userId,
        title   : r.extractedText,
        priority: r.priority,
        cluster : r.assignedCluster ?? null,
        dueDate : r.dueDate   ?? undefined,
        repeat  : r.recurrence?? undefined
      }).save();
      r.status        = 'approved';
      r.createdTaskId = t._id;
    }

    /* save all ripples */
    const rippleDocs = [];
    for (const r of [...autoRipples, ...manualRipples]) {
      rippleDocs.push(await new Ripple({
        userId       : context.user.userId,
        sourceEntryId: entry._id,
        entryDate    : entry.date,
        ...r
      }).save());
    }

    /* suggested tasks for remaining task-type ripples */
    for (const rip of rippleDocs) {
      if (rip.status === 'pending' && rip.type.endsWith('Task')) {
        await SuggestedTask.create({
          userId        : rip.userId,
          sourceRippleId: rip._id,
          title         : rip.extractedText,
          priority      : rip.priority,
          dueDate       : rip.dueDate   ?? undefined,
          repeat        : rip.recurrence?? undefined,
          cluster       : rip.assignedCluster ?? null
        });
      }
    }

    /* ONLY return the entry for the UI */
    return entry;
  },

  /* ─────────── Mutation: updateEntry (returns Entry) ─────────── */
  updateEntry: async ({ id, input }, context) => {
    if (!context.user) throw new Error('Unauthorized');

    const entry = await Entry.findOne({ _id: id, userId: context.user.userId });
    if (!entry) throw new Error('Entry not found');

    Object.assign(entry, input);
    const updated = await entry.save();

    /* refresh ripples & suggested tasks */
    await Ripple.deleteMany({ sourceEntryId: id, userId: context.user.userId });
    await SuggestedTask.deleteMany({ sourceRippleId: { $in: [] } }); // optional clean-up

    const extracted = extractRipples([updated.toObject()]);
    const autoRipples   = extracted.filter(r => r.priority === 'high' && r.confidence >= 0.8);
    const manualRipples = extracted.filter(r => !autoRipples.includes(r));

    for (const r of autoRipples) {
      const t = await new Task({
        userId  : context.user.userId,
        title   : r.extractedText,
        priority: r.priority,
        cluster : r.assignedCluster ?? null,
        dueDate : r.dueDate   ?? undefined,
        repeat  : r.recurrence?? undefined
      }).save();
      r.status        = 'approved';
      r.createdTaskId = t._id;
    }

    const rippleDocs = [];
    for (const r of [...autoRipples, ...manualRipples]) {
      rippleDocs.push(await new Ripple({
        userId       : context.user.userId,
        sourceEntryId: updated._id,
        entryDate    : updated.date,
        ...r
      }).save());
    }

    for (const rip of rippleDocs) {
      if (rip.status === 'pending' && rip.type.endsWith('Task')) {
        await SuggestedTask.create({
          userId        : rip.userId,
          sourceRippleId: rip._id,
          title         : rip.extractedText,
          priority      : rip.priority,
          dueDate       : rip.dueDate   ?? undefined,
          repeat        : rip.recurrence?? undefined,
          cluster       : rip.assignedCluster ?? null
        });
      }
    }

    return updated;
  }
};

export default root;
