import Entry from '../models/Entry.js';

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
}
,

createEntry: async ({ input }, context) => {
  if (!context.user) {
    throw new Error('Unauthorized');
  }

  const newEntry = new Entry({
    ...input,
    userId: context.user.userId,
  });
  return await newEntry.save();
},


};

export default root;
