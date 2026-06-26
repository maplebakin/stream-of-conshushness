import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';

const store = vi.hoisted(() => ({
  entries: [],
  ripples: [],
  suggestedTasks: [],
  tasks: [],
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

function makeSuggestedTask(doc) {
  return {
    _id: new ObjectId(),
    status: 'pending',
    ...doc,
    save: vi.fn(async function save() { return this; }),
  };
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

vi.mock('../../models/Ripple.js', () => ({
  default: {
    find: vi.fn((query) => withSelectLean(
      store.ripples.filter((ripple) => (
        sameId(ripple.userId, query.userId) &&
        (!query.entryId || sameId(ripple.entryId, query.entryId))
      ))
    )),
    deleteMany: vi.fn(async (query) => {
      const before = store.ripples.length;
      store.ripples = store.ripples.filter((ripple) => !(
        sameId(ripple.userId, query.userId) &&
        sameId(ripple.entryId, query.entryId) &&
        (!query.status || ripple.status === query.status)
      ));
      return { deletedCount: before - store.ripples.length };
    }),
    insertMany: vi.fn(async (docs) => {
      const inserted = docs.map((doc) => ({
        _id: new ObjectId(),
        status: 'pending',
        ...doc,
      }));
      store.ripples.push(...inserted);
      return inserted;
    }),
    findOne: vi.fn((query) => ({
      select: () => ({
        lean: async () => store.ripples.find((ripple) => (
          sameId(ripple._id, query._id) &&
          sameId(ripple.userId, query.userId)
        )) || null,
      }),
    })),
    findOneAndUpdate: vi.fn(async (query, update) => {
      const ripple = store.ripples.find((item) => (
        sameId(item._id, query._id) &&
        sameId(item.userId, query.userId)
      ));
      if (!ripple) return null;
      Object.assign(ripple, update?.$set || update || {});
      return ripple;
    }),
    updateMany: vi.fn(async (query, update) => {
      const ids = query._id?.$in || [];
      let modifiedCount = 0;
      for (const ripple of store.ripples) {
        if (
          ids.some((id) => sameId(id, ripple._id)) &&
          sameId(ripple.userId, query.userId) &&
          (!query.status || ripple.status === query.status)
        ) {
          Object.assign(ripple, update?.$set || update || {});
          modifiedCount += 1;
        }
      }
      return { modifiedCount };
    }),
    modelName: 'Ripple',
  },
}));

vi.mock('../../models/SuggestedTask.js', () => ({
  default: {
    deleteMany: vi.fn(async (query) => {
      const sourceIds = query.sourceRippleId?.$in || [];
      const before = store.suggestedTasks.length;
      store.suggestedTasks = store.suggestedTasks.filter((suggestion) => !(
        sameId(suggestion.userId, query.userId) &&
        sourceIds.some((id) => sameId(id, suggestion.sourceRippleId)) &&
        (!query.status || suggestion.status === query.status)
      ));
      return { deletedCount: before - store.suggestedTasks.length };
    }),
    insertMany: vi.fn(async (docs) => {
      const inserted = docs.map((doc) => makeSuggestedTask(doc));
      store.suggestedTasks.push(...inserted);
      return inserted;
    }),
    findOne: vi.fn(async (query) => store.suggestedTasks.find((suggestion) => (
      sameId(suggestion._id, query._id) &&
      sameId(suggestion.userId, query.userId) &&
      suggestion.status === query.status
    )) || null),
    updateMany: vi.fn(async (query, update) => {
      const sourceIds = query.sourceRippleId?.$in || [];
      let modifiedCount = 0;
      for (const suggestion of store.suggestedTasks) {
        if (
          sameId(suggestion.userId, query.userId) &&
          sourceIds.some((id) => sameId(id, suggestion.sourceRippleId)) &&
          (!query.status || suggestion.status === query.status) &&
          (!query.title || suggestion.title === query.title)
        ) {
          Object.assign(suggestion, update?.$set || update || {});
          modifiedCount += 1;
        }
      }
      return { modifiedCount };
    }),
    modelName: 'SuggestedTask',
  },
}));

vi.mock('../../models/Task.js', () => ({
  default: {
    insertMany: vi.fn(async (docs) => {
      const inserted = docs.map((doc) => ({ _id: new ObjectId(), ...doc }));
      store.tasks.push(...inserted);
      return inserted;
    }),
    create: vi.fn(async (doc) => {
      const task = { _id: new ObjectId(), ...doc };
      store.tasks.push(task);
      return task;
    }),
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

vi.mock('../../models/SuggestedGatherItem.js', () => ({
  default: {
    deleteMany: vi.fn(),
    find: vi.fn(() => withSelectLean([])),
    insertMany: vi.fn(async () => []),
    modelName: 'SuggestedGatherItem',
  },
}));

vi.mock('../../models/GatherItem.js', () => ({
  default: {
    find: vi.fn(() => withSelectLean([])),
    modelName: 'GatherItem',
  },
}));

vi.mock('../../models/SuggestedInterest.js', () => ({
  default: {
    deleteMany: vi.fn(),
    find: vi.fn(() => withSelectLean([])),
    insertMany: vi.fn(async () => []),
    modelName: 'SuggestedInterest',
  },
}));

vi.mock('../../models/Interest.js', () => ({
  default: {
    find: vi.fn(() => withSelectLean([])),
    modelName: 'Interest',
  },
}));

vi.mock('../../models/Cluster.js', () => ({
  default: {
    find: vi.fn(() => ({
      select: () => ({
        lean: async () => [],
      }),
    })),
    findOne: vi.fn(() => ({
      select: () => ({
        lean: async () => null,
      }),
    })),
  },
}));

const entriesRouter = (await import('../entries.js')).default;
const suggestedTasksRouter = (await import('../suggestedTasks.js')).default;

describe('entry to suggested task acceptance flow', () => {
  const userId = new ObjectId();

  let app;

  beforeEach(() => {
    store.entries = [];
    store.ripples = [];
    store.suggestedTasks = [];
    store.tasks = [];

    app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.user = { userId };
      next();
    });
    app.use('/api/entries', entriesRouter);
    app.use('/api/suggested-tasks', suggestedTasksRouter);
  });

  it('creates a suggested task from an entry and accepting it creates a linked task', async () => {
    const entryRes = await request(app)
      .post('/api/entries')
      .send({
        date: '2026-06-08',
        text: 'I need to call the dentist tomorrow.',
      });

    expect(entryRes.status).toBe(201);
    expect(store.entries).toHaveLength(1);
    expect(store.ripples).toHaveLength(1);
    expect(store.suggestedTasks).toHaveLength(1);

    const entry = store.entries[0];
    const ripple = store.ripples[0];
    const suggestion = store.suggestedTasks[0];

    expect(entry.suggestedTasks[0]).toMatchObject({
      title: 'Call the dentist',
      dueDate: '2026-06-09',
      status: 'new',
    });
    expect(ripple).toMatchObject({
      userId,
      entryId: entry._id,
      dateKey: '2026-06-08',
      text: 'Call the dentist',
      status: 'pending',
      source: 'entry-automation',
    });
    expect(suggestion).toMatchObject({
      userId,
      sourceRippleId: ripple._id,
      title: 'Call the dentist',
      priority: 'low',
      dueDate: expect.any(Date),
      status: 'pending',
    });
    expect(suggestion.dueDate.toISOString()).toBe('2026-06-09T00:00:00.000Z');

    expect(store.tasks).toHaveLength(0);

    const acceptRes = await request(app)
      .put(`/api/suggested-tasks/${suggestion._id}/accept`);

    expect(acceptRes.status).toBe(200);
    expect(store.tasks).toHaveLength(1);

    const acceptedTask = store.tasks.at(-1);
    expect(acceptedTask).toMatchObject({
      userId,
      title: 'Call the dentist',
      priority: 0,
      dueDate: '2026-06-09',
      rrule: '',
      clusters: [],
      entryId: entry._id,
    });
    expect(suggestion.status).toBe('accepted');
    expect(suggestion.save).toHaveBeenCalled();
    expect(ripple.status).toBe('applied');
    expect(acceptRes.body.task).toMatchObject({
      title: 'Call the dentist',
      dueDate: '2026-06-09',
    });
  });

  it('replaces pending task suggestions when an entry is updated', async () => {
    const entryRes = await request(app)
      .post('/api/entries')
      .send({
        date: '2026-06-08',
        text: 'I need to call the dentist tomorrow.',
      });

    expect(entryRes.status).toBe(201);
    const entry = store.entries[0];
    expect(store.suggestedTasks).toHaveLength(1);
    expect(store.suggestedTasks[0]).toMatchObject({
      title: 'Call the dentist',
      status: 'pending',
    });

    const updateRes = await request(app)
      .patch(`/api/entries/${entry._id}`)
      .send({ text: 'I need to email the school tomorrow.' });

    expect(updateRes.status).toBe(200);
    const pendingSuggestions = store.suggestedTasks.filter((suggestion) => suggestion.status === 'pending');
    expect(pendingSuggestions).toHaveLength(1);
    expect(pendingSuggestions[0]).toMatchObject({
      title: 'Email the school',
      status: 'pending',
    });
    expect(pendingSuggestions.some((suggestion) => suggestion.title === 'Call the dentist')).toBe(false);
    expect(store.tasks).toHaveLength(0);
  });

  it('preserves accepted task artifacts and creates one new pending suggestion after update', async () => {
    const entryRes = await request(app)
      .post('/api/entries')
      .send({
        date: '2026-06-08',
        text: 'I need to call the dentist tomorrow.',
      });

    expect(entryRes.status).toBe(201);
    const entry = store.entries[0];
    const originalSuggestion = store.suggestedTasks[0];
    const originalRipple = store.ripples[0];

    const acceptRes = await request(app)
      .put(`/api/suggested-tasks/${originalSuggestion._id}/accept`);

    expect(acceptRes.status).toBe(200);
    expect(store.tasks).toHaveLength(1);
    expect(originalSuggestion.status).toBe('accepted');
    expect(originalRipple.status).toBe('applied');

    const updateRes = await request(app)
      .patch(`/api/entries/${entry._id}`)
      .send({ text: 'I need to email the school tomorrow.' });

    expect(updateRes.status).toBe(200);
    expect(store.tasks).toHaveLength(1);
    expect(store.tasks[0]).toMatchObject({
      title: 'Call the dentist',
      dueDate: '2026-06-09',
    });
    expect(originalSuggestion.status).toBe('accepted');
    expect(originalRipple.status).toBe('applied');

    const pendingSuggestions = store.suggestedTasks.filter((suggestion) => suggestion.status === 'pending');
    expect(pendingSuggestions).toHaveLength(1);
    expect(pendingSuggestions[0]).toMatchObject({
      title: 'Email the school',
      status: 'pending',
    });
    expect(store.suggestedTasks.filter((suggestion) => suggestion.title === 'Email the school')).toHaveLength(1);
  });
});
