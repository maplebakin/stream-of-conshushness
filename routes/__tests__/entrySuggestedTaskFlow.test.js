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

function withPopulateSortLean(rows) {
  return {
    populate: () => ({
      sort: () => ({
        lean: async () => rows,
      }),
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

function makeTask(doc) {
  return {
    _id: new ObjectId(),
    completed: false,
    status: 'todo',
    deletedAt: null,
    ...doc,
    populate: vi.fn(async function populate() { return this; }),
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
        (!query.entryId || sameId(ripple.entryId, query.entryId)) &&
        (!query.status || (
          query.status?.$in
            ? query.status.$in.includes(ripple.status)
            : ripple.status === query.status
        ))
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
    find: vi.fn((query) => {
      const rows = store.suggestedTasks
        .filter((suggestion) => (
          sameId(suggestion.userId, query.userId) &&
          (!query.status || (
            query.status?.$in
              ? query.status.$in.includes(suggestion.status)
              : suggestion.status === query.status
          ))
        ))
        .map((suggestion) => ({
          ...suggestion,
          sourceRippleId: store.ripples.find((ripple) => sameId(ripple._id, suggestion.sourceRippleId)) || suggestion.sourceRippleId,
        }));
      return withPopulateSortLean(rows);
    }),
    deleteMany: vi.fn(async (query) => {
      const sourceIds = [
        ...(query.sourceRippleId?.$in || []),
        ...((query.$or || []).flatMap((branch) => branch.sourceRippleId?.$in || [])),
      ];
      const sourceEntryIds = (query.$or || [])
        .map((branch) => branch.sourceEntryId)
        .filter(Boolean);
      const before = store.suggestedTasks.length;
      store.suggestedTasks = store.suggestedTasks.filter((suggestion) => !(
        sameId(suggestion.userId, query.userId) &&
        (
          sourceIds.some((id) => sameId(id, suggestion.sourceRippleId)) ||
          sourceEntryIds.some((id) => sameId(id, suggestion.sourceEntryId))
        ) &&
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
      (query.status?.$in
        ? query.status.$in.includes(suggestion.status)
        : suggestion.status === query.status)
    )) || null),
    findOneAndUpdate: vi.fn(async (query, update) => {
      const suggestion = store.suggestedTasks.find((item) => (
        sameId(item._id, query._id) &&
        sameId(item.userId, query.userId) &&
        (!query.status || item.status === query.status)
      ));
      if (!suggestion) return null;
      Object.assign(suggestion, update?.$set || update || {});
      if (update?.$unset) {
        for (const key of Object.keys(update.$unset)) delete suggestion[key];
      }
      return suggestion;
    }),
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
    findOne: vi.fn(async (query) => store.tasks.find((task) => (
      sameId(task.userId, query.userId) &&
      (!query.sourceSuggestionId || sameId(task.sourceSuggestionId, query.sourceSuggestionId))
    )) || null),
    insertMany: vi.fn(async (docs) => {
      const inserted = docs.map((doc) => makeTask(doc));
      store.tasks.push(...inserted);
      return inserted;
    }),
    create: vi.fn(async (doc) => {
      const task = makeTask(doc);
      store.tasks.push(task);
      return task;
    }),
    updateMany: vi.fn(async (query, update) => {
      let modifiedCount = 0;
      const set = update?.$set || update || {};

      for (const task of store.tasks) {
        if (query.userId && !sameId(task.userId, query.userId)) continue;
        if (Object.prototype.hasOwnProperty.call(query, 'completed') && task.completed !== query.completed) continue;
        if (Object.prototype.hasOwnProperty.call(query, 'dueDate') && task.dueDate !== query.dueDate) continue;
        if (Object.prototype.hasOwnProperty.call(query, 'deletedAt') && query.deletedAt === null && task.deletedAt != null) continue;
        if (query.clusters && !task.clusters?.some((clusterId) => sameId(clusterId, query.clusters))) continue;

        Object.assign(task, set);
        modifiedCount += 1;
      }

      return { modifiedCount };
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
  slugifyClusterSlug: (value) => String(value || '').trim().toLowerCase(),
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
  resolveOwnedEntryId: async (ownerId, value) => (
    store.entries.some((entry) => sameId(entry._id, value) && sameId(entry.userId, ownerId))
      ? value
      : null
  ),
  resolveOwnedGoalId: async (_userId, value) => value || null,
  resolveOwnedSectionId: async (_userId, value) => value || null,
  resolveOwnedSectionPageId: async (_userId, value) => value || null,
}));

const entriesRouter = (await import('../entries.js')).default;
const suggestedTasksRouter = (await import('../suggestedTasks.js')).default;
const tasksRouter = (await import('../tasks.js')).default;

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
    app.use('/api/tasks', tasksRouter);
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
    expect(suggestion.save).not.toHaveBeenCalled();
    expect(ripple.status).toBe('applied');
    expect(acceptRes.body.task).toMatchObject({
      title: 'Call the dentist',
      dueDate: '2026-06-09',
    });
  });

  it('daily loop smoke reviews, accepts, and carries forward an extracted task', async () => {
    const entryRes = await request(app)
      .post('/api/entries')
      .send({
        date: '2026-06-08',
        text: 'I need to call the dentist tomorrow.',
      });

    expect(entryRes.status).toBe(201);

    const pendingRes = await request(app)
      .get('/api/suggested-tasks')
      .query({ status: 'pending', date: '2026-06-08' });

    expect(pendingRes.status).toBe(200);
    expect(pendingRes.body).toHaveLength(1);
    expect(pendingRes.body[0]).toMatchObject({
      title: 'Call the dentist',
      status: 'pending',
    });

    const suggestion = store.suggestedTasks[0];
    const acceptRes = await request(app)
      .put(`/api/suggested-tasks/${suggestion._id}/accept`);

    expect(acceptRes.status).toBe(200);
    expect(store.tasks).toHaveLength(1);

    const task = store.tasks[0];
    expect(task).toMatchObject({
      title: 'Call the dentist',
      dueDate: '2026-06-09',
      completed: false,
      deletedAt: null,
    });

    const carryRes = await request(app)
      .post('/api/tasks/carry-forward')
      .send({ from: '2026-06-09', to: '2026-06-10' });

    expect(carryRes.status).toBe(200);
    expect(carryRes.body).toMatchObject({
      moved: 1,
      from: '2026-06-09',
      to: '2026-06-10',
    });
    expect(task).toMatchObject({
      entryId: store.entries[0]._id,
      dueDate: '2026-06-10',
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
      .send({ text: 'I need to email the school tomorrow.', mood: 'determined', pinned: true });

    expect(updateRes.status).toBe(200);
    expect(entry).toMatchObject({ mood: 'determined', pinned: true });
    const pendingSuggestions = store.suggestedTasks.filter((suggestion) => suggestion.status === 'pending');
    expect(pendingSuggestions).toHaveLength(1);
    expect(pendingSuggestions[0]).toMatchObject({
      title: 'Email the school',
      status: 'pending',
    });
    expect(pendingSuggestions.some((suggestion) => suggestion.title === 'Call the dentist')).toBe(false);
    expect(store.tasks).toHaveLength(0);
  });

  it('preserves an edited pending task suggestion through organizational metadata updates', async () => {
    const entryRes = await request(app)
      .post('/api/entries')
      .send({
        date: '2026-06-08',
        text: 'I need to call the dentist tomorrow.',
      });

    expect(entryRes.status).toBe(201);
    const entry = store.entries[0];
    const ripple = store.ripples[0];
    const suggestion = store.suggestedTasks[0];
    suggestion.title = 'Call the pediatric dentist';
    const originalArtifact = {
      rippleId: String(ripple._id),
      suggestionId: String(suggestion._id),
      title: suggestion.title,
      status: suggestion.status,
      dateKey: ripple.dateKey,
    };

    const updateRes = await request(app)
      .patch(`/api/entries/${entry._id}`)
      .send({
        mood: 'focused',
        tags: ['health', 'follow-up'],
        pinned: true,
        cluster: 'Health',
        clusters: [new ObjectId().toString()],
        section: 'Appointments',
        sectionId: new ObjectId().toString(),
        sectionPageId: new ObjectId().toString(),
        linkedGoal: new ObjectId().toString(),
      });

    expect(updateRes.status).toBe(200);
    expect(store.ripples).toHaveLength(1);
    expect(store.suggestedTasks).toHaveLength(1);
    expect(store.ripples[0]).toMatchObject({
      _id: ripple._id,
      dateKey: originalArtifact.dateKey,
      status: 'pending',
    });
    expect(store.suggestedTasks[0]).toMatchObject({
      _id: suggestion._id,
      title: originalArtifact.title,
      status: originalArtifact.status,
      sourceRippleId: ripple._id,
    });
    expect(String(store.ripples[0]._id)).toBe(originalArtifact.rippleId);
    expect(String(store.suggestedTasks[0]._id)).toBe(originalArtifact.suggestionId);
  });

  it('rejects an unavailable cluster reference without clearing links or churning suggestions', async () => {
    const createRes = await request(app)
      .post('/api/entries')
      .send({ date: '2026-06-08', text: 'I need to call the dentist tomorrow.' });

    expect(createRes.status).toBe(201);
    const entry = store.entries[0];
    const suggestionIds = store.suggestedTasks.map((item) => String(item._id));

    const updateRes = await request(app)
      .patch(`/api/entries/${entry._id}`)
      .send({ clusters: ['not-an-owned-cluster'] });

    expect(updateRes.status).toBe(400);
    expect(updateRes.body).toEqual({ error: 'clusters must reference only your clusters' });
    expect(entry.clusters).toEqual([]);
    expect(store.suggestedTasks.map((item) => String(item._id))).toEqual(suggestionIds);
  });

  it('does not churn automation artifacts for an empty update', async () => {
    const entryRes = await request(app)
      .post('/api/entries')
      .send({
        date: '2026-06-08',
        text: 'I need to call the dentist tomorrow.',
      });

    expect(entryRes.status).toBe(201);
    const entry = store.entries[0];
    const ripple = store.ripples[0];
    const suggestion = store.suggestedTasks[0];

    const updateRes = await request(app)
      .patch(`/api/entries/${entry._id}`)
      .send({});

    expect(updateRes.status).toBe(200);
    expect(store.ripples).toEqual([ripple]);
    expect(store.suggestedTasks).toEqual([suggestion]);
  });

  it('regenerates date-dependent task artifacts but not text-only domains on date-only update', async () => {
    const entryRes = await request(app)
      .post('/api/entries')
      .send({
        date: '2026-06-08',
        text: 'I need to call the dentist tomorrow.',
      });

    expect(entryRes.status).toBe(201);
    const entry = store.entries[0];
    const originalRippleId = String(store.ripples[0]._id);
    const originalSuggestionId = String(store.suggestedTasks[0]._id);

    const updateRes = await request(app)
      .patch(`/api/entries/${entry._id}`)
      .send({ date: '2026-06-10' });

    expect(updateRes.status).toBe(200);
    expect(entry.suggestedTasks[0]).toMatchObject({
      title: 'Call the dentist',
      dueDate: '2026-06-11',
    });
    expect(store.ripples).toHaveLength(1);
    expect(store.suggestedTasks).toHaveLength(1);
    expect(String(store.ripples[0]._id)).not.toBe(originalRippleId);
    expect(String(store.suggestedTasks[0]._id)).not.toBe(originalSuggestionId);
    expect(store.suggestedTasks[0].dueDate.toISOString()).toBe('2026-06-11T00:00:00.000Z');
  });

  it('preserves rejected task artifacts while creating new pending artifacts after a content edit', async () => {
    const entryRes = await request(app)
      .post('/api/entries')
      .send({
        date: '2026-06-08',
        text: 'I need to call the dentist tomorrow.',
      });

    expect(entryRes.status).toBe(201);
    const entry = store.entries[0];
    const rejectedSuggestion = store.suggestedTasks[0];
    const rejectedRipple = store.ripples[0];
    const rejectRes = await request(app)
      .put(`/api/suggested-tasks/${rejectedSuggestion._id}/reject`);

    expect(rejectRes.status).toBe(200);
    expect(rejectedSuggestion.status).toBe('rejected');
    expect(rejectedRipple.status).toBe('dismissed');

    const updateRes = await request(app)
      .patch(`/api/entries/${entry._id}`)
      .send({ text: 'I need to call the dentist tomorrow. I need to email the school tomorrow.' });

    expect(updateRes.status).toBe(200);
    expect(rejectedSuggestion.status).toBe('rejected');
    expect(rejectedRipple.status).toBe('dismissed');
    expect(store.suggestedTasks.filter((item) => item.status === 'pending')).toHaveLength(1);
    expect(store.suggestedTasks.filter((item) => item.status === 'pending')[0].title).toBe('Email the school');
    expect(store.suggestedTasks.filter((item) => item.status === 'pending' && item.title === 'Call the dentist')).toHaveLength(0);
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
      .send({ text: 'I need to call the dentist tomorrow. I need to email the school tomorrow.' });

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
    expect(store.suggestedTasks.filter((suggestion) => suggestion.status === 'pending' && suggestion.title === 'Call the dentist')).toHaveLength(0);
  });
});
