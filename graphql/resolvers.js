import Entry from '../models/Entry.js';
import Ripple from '../models/Ripple.js';
import { extractRipples } from '../utils/rippleExtractor.js';

const root = {
  entries: async ({ section, date }, context) => {
    try {
      if (!context.user) {
        console.warn('⚠️ No user info on request');
        throw new Error('Unauthorized');
      }

      const filter = { userId: context.user.userId || context.user._id };
      if (section) filter.section = section;
      if (date) filter.date = date;

      console.log('📥 Querying entries with filter:', filter);
      return await Entry.find(filter).sort({ date: -1 });
    } catch (err) {
      console.error('❌ GraphQL error in entries resolver:', err);
      throw err;
    }
  },

  createEntry: async ({ input }, context) => {
    if (!context.user) throw new Error('Unauthorized');

    const newEntry = new Entry({
      ...input,
      userId: context.user.userId,
    });
    const savedEntry = await newEntry.save();

    // 🌀 Extract ripples from this entry
    const ripples = extractRipples([{ ...savedEntry.toObject() }]);

    // 🧷 Attach extra data to ripples
    const rippleDocs = ripples.map(r => ({
      ...r,
      userId: context.user.userId,
      sourceEntryId: savedEntry._id,
      entryDate: savedEntry.date,
    }));

    // Save them
    if (rippleDocs.length > 0) {
      await Ripple.insertMany(rippleDocs);
      console.log(`🌊 Saved ${rippleDocs.length} ripple(s) from entry`);
    }

    return savedEntry;
  },

  updateEntry: async ({ id, input }, context) => {
    if (!context.user) throw new Error('Unauthorized');

    // Find the entry and ensure ownership
    const entry = await Entry.findOne({ _id: id, userId: context.user.userId });
    if (!entry) throw new Error('Entry not found or unauthorized');

    // Update fields
    Object.assign(entry, input);

    const updatedEntry = await entry.save();

    // Optionally: remove old ripples and re-extract from updated content
    await Ripple.deleteMany({ sourceEntryId: id, userId: context.user.userId });

    const ripples = extractRipples([{ ...updatedEntry.toObject() }]);

    const rippleDocs = ripples.map(r => ({
      ...r,
      userId: context.user.userId,
      sourceEntryId: updatedEntry._id,
      entryDate: updatedEntry.date,
    }));

    if (rippleDocs.length > 0) {
      await Ripple.insertMany(rippleDocs);
      console.log(`🌊 Updated ripples saved (${rippleDocs.length}) for entry ${id}`);
    }

    return updatedEntry;
  }
};

export default root;
