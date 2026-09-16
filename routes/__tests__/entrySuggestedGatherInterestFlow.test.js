import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';

const store = vi.hoisted(() => ({
  entries: [],
  suggestedGatherItems: [],
  gatherItems: [],
  suggestedInterests: [],
  interests: [],
}));

const { ObjectId } = mongoose.Types;

function sameId(a, b) {
  return String(a) === String(b);
}

function withSelectLean(rows) {
  return {
    select: () => ({
      lean: async () => rows,
    }),
  };
}

function makeEntry(doc) {
  return {
    _id: new ObjectId(),
    ...doc,
    clusters: doc.clusters || [],
    save: vi.fn(async function save() { return this; }),
    populate: vi.fn(async function populate() { return this; }),
  };
}

function makeSuggestion(doc) {
  return {
    _id: new ObjectId(),
    status: 'pending',
    ...doc,
    save: vi.fn(async function save() { return this; }),
  };
}

function activeStatuses(query) {
  return query.status?.$in || (query.status ? [query.status] : null);
}

vi.mock('../../utils/analyzeEntry.js', () => ({
  default: () => null,
}));

vi.mock('../../models/Entry.js', () => ({
  default: {
    create: vi.fn(async (doc) => {
      const entry = makeEntry(doc);
      store.entries.push(entry);
      return entry;
    }),
    findOne: vi.fn(async (query) => store.entries.find((entry) => (
      sameId(entry._id, query._id) &&
      sameId(entry.userId, query.userId)
    )) || null),
  },
}));

vi.mock('../../models/SuggestedGatherItem.js', () => ({
  default: {
    deleteMany: vi.fn(async (query) => {
      const before = store.suggestedGatherItems.length;
      store.suggestedGatherItems = store.suggestedGatherItems.filter((item) => !(
        sameId(item.userId, query.userId) &&
        sameId(item.sourceEntryId, query.sourceEntryId) &&
        (!query.status || item.status === query.status)
      ));
      return { deletedCount: before - store.suggestedGatherItems.length };
    }),
    find: vi.fn((query) => withSelectLean(
      store.suggestedGatherItems.filter((item) => (
        sameId(item.userId, query.userId) &&
        item.list === query.list &&
        (!query.status || item.status === query.status)
      ))
    )),
    insertMany: vi.fn(async (docs) => {
      const inserted = docs.map((doc) => makeSuggestion(doc));
      store.suggestedGatherItems.push(...inserted);
      return inserted;
    }),
    findOne: vi.fn(async (query) => store.suggestedGatherItems.find((item) => (
      sameId(item._id, query._id) &&
      sameId(item.userId, query.userId) &&
      (query.status?.$in ? query.status.$in.includes(item.status) : item.status === query.status)
    )) || null),
    findOneAndUpdate: vi.fn(async (query, update) => {
      const item = store.suggestedGatherItems.find((candidate) => (
        sameId(candidate._id, query._id) &&
        sameId(candidate.userId, query.userId) &&
        (!query.status || candidate.status === query.status)
      ));
      if (!item) return null;
      Object.assign(item, update?.$set || update || {});
      if (update?.$unset) {
        for (const key of Object.keys(update.$unset)) delete item[key];
      }
      return item;
    }),
    modelName: 'SuggestedGatherItem',
  },
}));

vi.mock('../../models/GatherItem.js', () => ({
  default: {
    findOne: vi.fn(async (query) => store.gatherItems.find((item) => (
      sameId(item.userId, query.userId) &&
      (!query.sourceSuggestionId || sameId(item.sourceSuggestionId, query.sourceSuggestionId))
    )) || null),
    find: vi.fn((query) => withSelectLean(
      store.gatherItems.filter((item) => {
        const statuses = activeStatuses(query);
        return (
          sameId(item.userId, query.userId) &&
          item.list === query.list &&
          (!statuses || statuses.includes(item.status))
        );
      })
    )),
    create: vi.fn(async (doc) => {
      const item = {
        _id: new ObjectId(),
        ...doc,
        populate: vi.fn(async function populate() { return this; }),
      };
      store.gatherItems.push(item);
      return item;
    }),
    modelName: 'GatherItem',
  },
}));

vi.mock('../../models/SuggestedInterest.js', () => ({
  default: {
    deleteMany: vi.fn(async (query) => {
      const before = store.suggestedInterests.length;
      store.suggestedInterests = store.suggestedInterests.filter((item) => !(
        sameId(item.userId, query.userId) &&
        sameId(item.sourceEntryId, query.sourceEntryId) &&
        (!query.status || item.status === query.status)
      ));
      return { deletedCount: before - store.suggestedInterests.length };
    }),
    find: vi.fn((query) => withSelectLean(
      store.suggestedInterests.filter((item) => (
        sameId(item.userId, query.userId) &&
        item.category === query.category &&
        (!query.status || item.status === query.status)
      ))
    )),
    insertMany: vi.fn(async (docs) => {
      const inserted = docs.map((doc) => makeSuggestion(doc));
      store.suggestedInterests.push(...inserted);
      return inserted;
    }),
    findOne: vi.fn(async (query) => store.suggestedInterests.find((item) => (
      sameId(item._id, query._id) &&
      sameId(item.userId, query.userId) &&
      (query.status?.$in ? query.status.$in.includes(item.status) : item.status === query.status)
    )) || null),
    findOneAndUpdate: vi.fn(async (query, update) => {
      const item = store.suggestedInterests.find((candidate) => (
        sameId(candidate._id, query._id) &&
        sameId(candidate.userId, query.userId) &&
        (!query.status || candidate.status === query.status)
      ));
      if (!item) return null;
      Object.assign(item, update?.$set || update || {});
      if (update?.$unset) {
        for (const key of Object.keys(update.$unset)) delete item[key];
      }
      return item;
    }),
    modelName: 'SuggestedInterest',
  },
}));

vi.mock('../../models/Interest.js', () => ({
  default: {
    findOne: vi.fn(async (query) => store.interests.find((item) => (
      sameId(item.userId, query.userId) &&
      (!query.sourceSuggestionId || sameId(item.sourceSuggestionId, query.sourceSuggestionId))
    )) || null),
    find: vi.fn((query) => withSelectLean(
      store.interests.filter((item) => {
        const statuses = activeStatuses(query);
        return (
          sameId(item.userId, query.userId) &&
          item.category === query.category &&
          (!statuses || statuses.includes(item.status))
        );
      })
    )),
    create: vi.fn(async (doc) => {
      const item = {
        _id: new ObjectId(),
        ...doc,
        populate: vi.fn(async function populate() { return this; }),
      };
      store.interests.push(item);
      return item;
    }),
    modelName: 'Interest',
  },
}));

vi.mock('../../models/Ripple.js', () => ({
  default: {
    find: vi.fn(() => withSelectLean([])),
    deleteMany: vi.fn(),
    insertMany: vi.fn(async () => []),
    modelName: 'Ripple',
  },
}));

vi.mock('../../models/SuggestedTask.js', () => ({
  default: {
    deleteMany: vi.fn(),
    insertMany: vi.fn(async () => []),
    modelName: 'SuggestedTask',
  },
}));

vi.mock('../../models/Task.js', () => ({
  default: {
    insertMany: vi.fn(async () => []),
    modelName: 'Task',
  },
}));

vi.mock('../../models/ImportantEvent.js', () => ({
  default: {
    findOne: vi.fn(async () => null),
    create: vi.fn(async (doc) => ({ _id: new ObjectId(), ...doc })),
    deleteMany: vi.fn(),
  },
}));

vi.mock('../../models/Appointment.js', () => ({
  default: {
    findOne: vi.fn(async () => null),
    create: vi.fn(async (doc) => ({ _id: new ObjectId(), ...doc })),
    deleteMany: vi.fn(),
  },
}));

vi.mock('../../models/Cluster.js', () => ({
  default: {
    find: vi.fn(() => ({
      select: () => ({
        lean: async () => [],
      }),
    })),
    findOne: vi.fn((query) => ({
      select: () => ({
        lean: async () => query?._id ? { _id: query._id } : null,
      }),
    })),
  },
}));

vi.mock('../../utils/ownedReferences.js', () => ({
  resolveOwnedEntryId: async (_userId, value) => value || null,
  resolveOwnedGoalId: async (_userId, value) => value || null,
  resolveOwnedSectionId: async (_userId, value) => value || null,
  resolveOwnedSectionPageId: async (_userId, value) => value || null,
}));

const entriesRouter = (await import('../entries.js')).default;
const suggestedGatherItemsRouter = (await import('../suggestedGatherItems.js')).default;
const suggestedInterestsRouter = (await import('../suggestedInterests.js')).default;

describe('entry to staged gather and interest acceptance flows', () => {
  const userId = new ObjectId();

  let app;

  beforeEach(() => {
    store.entries = [];
    store.suggestedGatherItems = [];
    store.gatherItems = [];
    store.suggestedInterests = [];
    store.interests = [];

    app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.user = { userId };
      next();
    });
    app.use('/api/entries', entriesRouter);
    app.use('/api/suggested-gather-items', suggestedGatherItemsRouter);
    app.use('/api/suggested-interests', suggestedInterestsRouter);
  });

  it('stages a gather item from an entry and accepting it creates one linked GatherItem', async () => {
    const entryRes = await request(app)
      .post('/api/entries')
      .send({
        date: '2026-06-08',
        text: 'I need to buy printer paper.',
      });

    expect(entryRes.status).toBe(201);
    expect(store.entries).toHaveLength(1);
    expect(store.suggestedGatherItems).toHaveLength(1);
    expect(store.gatherItems).toHaveLength(0);

    const entry = store.entries[0];
    const suggestion = store.suggestedGatherItems[0];

    expect(suggestion).toMatchObject({
      userId,
      title: 'Printer paper',
      normalizedTitle: 'printer paper',
      list: 'Things to Buy',
      status: 'pending',
      sourceEntryId: entry._id,
      sourceText: 'I need to buy printer paper.',
    });

    const acceptRes = await request(app)
      .put(`/api/suggested-gather-items/${suggestion._id}/accept`);

    expect(acceptRes.status).toBe(200);
    expect(store.gatherItems).toHaveLength(1);
    expect(store.gatherItems[0]).toMatchObject({
      userId,
      title: 'Printer paper',
      normalizedTitle: 'printer paper',
      list: 'Things to Buy',
      status: 'needed',
      sourceEntryId: entry._id,
      sourceText: 'I need to buy printer paper.',
    });
    expect(suggestion.status).toBe('accepted');
    expect(suggestion.save).not.toHaveBeenCalled();
    expect(acceptRes.body.gatherItem).toMatchObject({
      title: 'Printer paper',
      status: 'needed',
    });
  });

  it('stages an interest from an entry and accepting it creates one linked Interest', async () => {
    const entryRes = await request(app)
      .post('/api/entries')
      .send({
        date: '2026-06-08',
        text: 'I want to learn pottery.',
      });

    expect(entryRes.status).toBe(201);
    expect(store.entries).toHaveLength(1);
    expect(store.suggestedInterests).toHaveLength(1);
    expect(store.interests).toHaveLength(0);

    const entry = store.entries[0];
    const suggestion = store.suggestedInterests[0];

    expect(suggestion).toMatchObject({
      userId,
      title: 'Pottery',
      normalizedTitle: 'pottery',
      category: 'Learning Curiosities',
      status: 'pending',
      sourceEntryId: entry._id,
      sourceText: 'I want to learn pottery.',
      reason: 'learnSkill',
    });

    const acceptRes = await request(app)
      .put(`/api/suggested-interests/${suggestion._id}/accept`)
      .send({ status: 'exploring' });

    expect(acceptRes.status).toBe(200);
    expect(store.interests).toHaveLength(1);
    expect(store.interests[0]).toMatchObject({
      userId,
      title: 'Pottery',
      normalizedTitle: 'pottery',
      category: 'Learning Curiosities',
      status: 'exploring',
      sourceEntryId: entry._id,
      sourceText: 'I want to learn pottery.',
      reason: 'learnSkill',
    });
    expect(suggestion.status).toBe('accepted');
    expect(suggestion.save).not.toHaveBeenCalled();
    expect(acceptRes.body.interest).toMatchObject({
      title: 'Pottery',
      status: 'exploring',
    });
  });

  it('replaces pending gather suggestions when an entry is updated', async () => {
    const entryRes = await request(app)
      .post('/api/entries')
      .send({
        date: '2026-06-08',
        text: 'I need to buy printer paper.',
      });

    expect(entryRes.status).toBe(201);
    const entry = store.entries[0];
    expect(store.suggestedGatherItems).toHaveLength(1);
    expect(store.suggestedGatherItems[0]).toMatchObject({
      title: 'Printer paper',
      status: 'pending',
    });

    const updateRes = await request(app)
      .patch(`/api/entries/${entry._id}`)
      .send({ text: 'I need to buy printer ink.' });

    expect(updateRes.status).toBe(200);
    const pendingSuggestions = store.suggestedGatherItems.filter((item) => item.status === 'pending');
    expect(pendingSuggestions).toHaveLength(1);
    expect(pendingSuggestions[0]).toMatchObject({
      title: 'Printer ink',
      status: 'pending',
      sourceEntryId: entry._id,
      sourceText: 'I need to buy printer ink.',
    });
    expect(pendingSuggestions.some((item) => item.title === 'Printer paper')).toBe(false);
    expect(store.gatherItems).toHaveLength(0);
  });

  it('preserves accepted gather items and creates one new pending suggestion after update', async () => {
    const entryRes = await request(app)
      .post('/api/entries')
      .send({
        date: '2026-06-08',
        text: 'I need to buy printer paper.',
      });

    expect(entryRes.status).toBe(201);
    const entry = store.entries[0];
    const originalSuggestion = store.suggestedGatherItems[0];

    const acceptRes = await request(app)
      .put(`/api/suggested-gather-items/${originalSuggestion._id}/accept`);

    expect(acceptRes.status).toBe(200);
    expect(store.gatherItems).toHaveLength(1);
    expect(originalSuggestion.status).toBe('accepted');

    const updateRes = await request(app)
      .patch(`/api/entries/${entry._id}`)
      .send({ text: 'I need to buy printer ink.' });

    expect(updateRes.status).toBe(200);
    expect(store.gatherItems).toHaveLength(1);
    expect(store.gatherItems[0]).toMatchObject({
      title: 'Printer paper',
      status: 'needed',
      sourceEntryId: entry._id,
    });
    expect(originalSuggestion.status).toBe('accepted');

    const pendingSuggestions = store.suggestedGatherItems.filter((item) => item.status === 'pending');
    expect(pendingSuggestions).toHaveLength(1);
    expect(pendingSuggestions[0]).toMatchObject({
      title: 'Printer ink',
      status: 'pending',
    });
    expect(store.suggestedGatherItems.filter((item) => item.title === 'Printer ink')).toHaveLength(1);
  });

  it('replaces pending interest suggestions when an entry is updated', async () => {
    const entryRes = await request(app)
      .post('/api/entries')
      .send({
        date: '2026-06-08',
        text: 'I want to learn pottery.',
      });

    expect(entryRes.status).toBe(201);
    const entry = store.entries[0];
    expect(store.suggestedInterests).toHaveLength(1);
    expect(store.suggestedInterests[0]).toMatchObject({
      title: 'Pottery',
      status: 'pending',
    });

    const updateRes = await request(app)
      .patch(`/api/entries/${entry._id}`)
      .send({ text: 'I want to learn guitar.' });

    expect(updateRes.status).toBe(200);
    const pendingSuggestions = store.suggestedInterests.filter((item) => item.status === 'pending');
    expect(pendingSuggestions).toHaveLength(1);
    expect(pendingSuggestions[0]).toMatchObject({
      title: 'Guitar',
      status: 'pending',
      sourceEntryId: entry._id,
      sourceText: 'I want to learn guitar.',
    });
    expect(pendingSuggestions.some((item) => item.title === 'Pottery')).toBe(false);
    expect(store.interests).toHaveLength(0);
  });

  it('preserves pending gather and interest artifacts through organizational metadata updates', async () => {
    const text = 'I need to buy printer paper. I want to learn pottery.';
    const entryRes = await request(app)
      .post('/api/entries')
      .send({ date: '2026-06-08', text });

    expect(entryRes.status).toBe(201);
    const entry = store.entries[0];
    expect(store.suggestedGatherItems).toHaveLength(1);
    expect(store.suggestedInterests).toHaveLength(1);
    const gatherSuggestion = store.suggestedGatherItems[0];
    const interestSuggestion = store.suggestedInterests[0];
    gatherSuggestion.title = 'Printer paper, letter size';
    interestSuggestion.title = 'Wheel pottery';
    const original = {
      gatherId: String(gatherSuggestion._id),
      gatherTitle: gatherSuggestion.title,
      gatherSourceText: gatherSuggestion.sourceText,
      interestId: String(interestSuggestion._id),
      interestTitle: interestSuggestion.title,
      interestSourceText: interestSuggestion.sourceText,
    };

    const updateRes = await request(app)
      .patch(`/api/entries/${entry._id}`)
      .send({
        mood: 'curious',
        tags: ['errands', 'creative'],
        pinned: true,
        cluster: 'Home',
        clusters: [new ObjectId().toString()],
        section: 'Weekend',
        sectionId: new ObjectId().toString(),
        sectionPageId: new ObjectId().toString(),
        linkedGoal: new ObjectId().toString(),
      });

    expect(updateRes.status).toBe(200);
    expect(store.suggestedGatherItems).toHaveLength(1);
    expect(store.suggestedInterests).toHaveLength(1);
    expect(store.suggestedGatherItems[0]).toMatchObject({
      _id: gatherSuggestion._id,
      title: original.gatherTitle,
      sourceText: original.gatherSourceText,
      status: 'pending',
    });
    expect(store.suggestedInterests[0]).toMatchObject({
      _id: interestSuggestion._id,
      title: original.interestTitle,
      sourceText: original.interestSourceText,
      status: 'pending',
    });
    expect(String(store.suggestedGatherItems[0]._id)).toBe(original.gatherId);
    expect(String(store.suggestedInterests[0]._id)).toBe(original.interestId);
  });

  it('preserves accepted interests and creates one new pending suggestion after update', async () => {
    const entryRes = await request(app)
      .post('/api/entries')
      .send({
        date: '2026-06-08',
        text: 'I want to learn pottery.',
      });

    expect(entryRes.status).toBe(201);
    const entry = store.entries[0];
    const originalSuggestion = store.suggestedInterests[0];

    const acceptRes = await request(app)
      .put(`/api/suggested-interests/${originalSuggestion._id}/accept`)
      .send({ status: 'exploring' });

    expect(acceptRes.status).toBe(200);
    expect(store.interests).toHaveLength(1);
    expect(originalSuggestion.status).toBe('accepted');

    const updateRes = await request(app)
      .patch(`/api/entries/${entry._id}`)
      .send({ text: 'I want to learn guitar.' });

    expect(updateRes.status).toBe(200);
    expect(store.interests).toHaveLength(1);
    expect(store.interests[0]).toMatchObject({
      title: 'Pottery',
      status: 'exploring',
      sourceEntryId: entry._id,
    });
    expect(originalSuggestion.status).toBe('accepted');

    const pendingSuggestions = store.suggestedInterests.filter((item) => item.status === 'pending');
    expect(pendingSuggestions).toHaveLength(1);
    expect(pendingSuggestions[0]).toMatchObject({
      title: 'Guitar',
      status: 'pending',
    });
    expect(store.suggestedInterests.filter((item) => item.title === 'Guitar')).toHaveLength(1);
  });
});
