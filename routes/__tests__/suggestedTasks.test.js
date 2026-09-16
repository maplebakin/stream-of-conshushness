// routes/__tests__/suggestedTasks.test.js

import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';

const mockFindOne = vi.hoisted(() => vi.fn());
const mockSuggestedFindOneAndUpdate = vi.hoisted(() => vi.fn());
const mockFind = vi.hoisted(() => vi.fn());
const mockUpdateMany = vi.hoisted(() => vi.fn());
const mockCreate = vi.hoisted(() => vi.fn());
const mockTaskFindOne = vi.hoisted(() => vi.fn());
const mockRippleFindOne = vi.hoisted(() => vi.fn());
const mockRippleFind = vi.hoisted(() => vi.fn());
const mockRippleFindOneAndUpdate = vi.hoisted(() => vi.fn());
const mockRippleUpdateMany = vi.hoisted(() => vi.fn());
const mockResolveClusterIdForOwner = vi.hoisted(() => vi.fn());
const mockResolveOwnedEntryId = vi.hoisted(() => vi.fn());

vi.mock('../../models/SuggestedTask.js', () => ({
  default: {
    find: mockFind,
    findOne: mockFindOne,
    findOneAndUpdate: mockSuggestedFindOneAndUpdate,
    updateMany: mockUpdateMany,
  },
}));

vi.mock('../../models/Task.js', () => ({
  default: {
    create: mockCreate,
    findOne: mockTaskFindOne,
  },
}));

vi.mock('../../models/Ripple.js', () => ({
  default: {
    find: mockRippleFind,
    findOne: mockRippleFindOne,
    findOneAndUpdate: mockRippleFindOneAndUpdate,
    updateMany: mockRippleUpdateMany,
  },
}));

vi.mock('../../utils/clusterIds.js', () => ({
  resolveClusterIdForOwner: mockResolveClusterIdForOwner,
}));

vi.mock('../../utils/ownedReferences.js', () => ({
  resolveOwnedEntryId: mockResolveOwnedEntryId,
}));

// Import router after mocks are configured
import router from '../suggestedTasks.js';

describe('Suggested Tasks acceptance', () => {
  const userId = new mongoose.Types.ObjectId();
  const resolvedClusterId = new mongoose.Types.ObjectId();

  function makeApp() {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.user = { userId };
      next();
    });
    app.use('/api/suggested-tasks', router);
    return app;
  }

  function mockSuggestedTaskFindResult(rows) {
    mockFind.mockReturnValue({
      populate: () => ({
        sort: () => ({
          lean: () => Promise.resolve(rows),
        }),
      }),
    });
  }

  function mockRippleFindResult(rows) {
    mockRippleFind.mockReturnValue({
      select: () => ({
        lean: () => Promise.resolve(rows),
      }),
    });
  }

  beforeEach(() => {
    vi.resetAllMocks();
    mockResolveClusterIdForOwner.mockResolvedValue(resolvedClusterId);
    mockResolveOwnedEntryId.mockImplementation(async (_ownerId, value) => value || null);
    mockRippleFindOne.mockReturnValue({
      select: () => ({
        lean: () => Promise.resolve(null),
      }),
    });
    mockRippleFindResult([]);
    mockRippleFindOneAndUpdate.mockResolvedValue(null);
    mockRippleUpdateMany.mockResolvedValue({ modifiedCount: 0 });
    mockUpdateMany.mockResolvedValue({ modifiedCount: 0 });
    mockSuggestedFindOneAndUpdate.mockImplementation(async (query, update) => {
      const suggestion = await mockFindOne(query);
      if (!suggestion) return null;
      Object.assign(suggestion, update?.$set || update || {});
      if (update?.$unset) {
        for (const key of Object.keys(update.$unset)) delete suggestion[key];
      }
      return suggestion;
    });
  });

  it('lists pending suggestions by default and does not request accepted suggestions', async () => {
    const pendingSuggestion = {
      _id: new mongoose.Types.ObjectId(),
      userId,
      title: 'Call the dentist',
      status: 'pending',
      sourceRippleId: { dateKey: '2026-06-26' },
    };
    mockSuggestedTaskFindResult([pendingSuggestion]);

    const res = await request(makeApp()).get('/api/suggested-tasks');

    expect(res.status).toBe(200);
    expect(mockFind).toHaveBeenCalledWith({
      userId,
      status: { $in: ['pending', 'accepting', 'rejecting'] },
    });
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ title: 'Call the dentist', status: 'pending' });
  });

  it('filters pending suggestions by source ripple date', async () => {
    mockSuggestedTaskFindResult([
      {
        _id: new mongoose.Types.ObjectId(),
        userId,
        title: 'Call the dentist',
        status: 'pending',
        sourceRippleId: { dateKey: '2026-06-26' },
      },
      {
        _id: new mongoose.Types.ObjectId(),
        userId,
        title: 'Email the school',
        status: 'pending',
        sourceRippleId: { dateKey: '2026-06-27' },
      },
    ]);

    const res = await request(makeApp()).get('/api/suggested-tasks?status=pending&date=2026-06-26');

    expect(res.status).toBe(200);
    expect(mockFind).toHaveBeenCalledWith({
      userId,
      status: { $in: ['pending', 'accepting', 'rejecting'] },
    });
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ title: 'Call the dentist', status: 'pending' });
  });

  it('normalizes due date, priority, and cluster data when accepting a suggestion', async () => {
    const dueDate = new Date('2025-02-01T10:20:30Z');

    const save = vi.fn().mockResolvedValue();
    const suggestedTaskDoc = {
      _id: new mongoose.Types.ObjectId(),
      userId,
      title: 'Review quarterly goals',
      priority: 'high',
      dueDate,
      repeat: 'weekly',
      cluster: 'focus-zone',
      status: 'pending',
      sourceRippleId: new mongoose.Types.ObjectId(),
      save,
    };

    mockFindOne.mockResolvedValue(suggestedTaskDoc);
    mockCreate.mockResolvedValue({
      _id: new mongoose.Types.ObjectId(),
      userId,
      title: suggestedTaskDoc.title,
    });

    const res = await request(makeApp()).put(`/api/suggested-tasks/${suggestedTaskDoc._id.toString()}/accept`);

    expect(res.status).toBe(200);
    expect(mockFindOne).toHaveBeenCalledWith({
      _id: suggestedTaskDoc._id.toString(),
      userId: userId,
      status: 'pending',
    });
    expect(mockResolveClusterIdForOwner).toHaveBeenCalledWith(userId, 'focus-zone');
    expect(mockCreate).toHaveBeenCalledWith({
      userId,
      title: 'Review quarterly goals',
      priority: 2,
      dueDate: '2025-02-01',
      rrule: 'FREQ=WEEKLY',
      clusters: [resolvedClusterId],
      sourceSuggestionId: suggestedTaskDoc._id,
    });
    expect(suggestedTaskDoc.status).toBe('accepted');
    expect(save).not.toHaveBeenCalled();
    expect(mockRippleFindOneAndUpdate).toHaveBeenCalledWith(
      { _id: suggestedTaskDoc.sourceRippleId, userId },
      { $set: { status: 'applied' } }
    );
    expect(res.body).toHaveProperty('task');
    expect(res.body).toHaveProperty('suggestedTask');
  });

  it('reuses the unique active task when an acceptance retry races a prior create', async () => {
    const suggestion = {
      _id: new mongoose.Types.ObjectId(),
      userId,
      title: 'Retry-safe task',
      priority: 'low',
      status: 'pending',
      sourceRippleId: new mongoose.Types.ObjectId(),
      save: vi.fn().mockResolvedValue(undefined),
    };
    const existingTask = { _id: new mongoose.Types.ObjectId(), sourceSuggestionId: suggestion._id };
    mockFindOne.mockResolvedValue(suggestion);
    mockCreate.mockRejectedValue(Object.assign(new Error('duplicate'), { code: 11000 }));
    mockTaskFindOne.mockResolvedValue(existingTask);

    const res = await request(makeApp()).put(`/api/suggested-tasks/${suggestion._id}/accept`);

    expect(res.status).toBe(200);
    expect(mockTaskFindOne).toHaveBeenCalledWith({ userId, sourceSuggestionId: suggestion._id });
    expect(res.body.task._id).toBe(String(existingTask._id));
    expect(suggestion.status).toBe('accepted');
  });

  it('returns one task to concurrent acceptance requests', async () => {
    const suggestionId = new mongoose.Types.ObjectId();
    const sourceRippleId = new mongoose.Types.ObjectId();
    const save = vi.fn().mockResolvedValue(undefined);
    const suggestion = {
      _id: suggestionId,
      userId,
      title: 'Concurrent task',
      priority: 'low',
      status: 'pending',
      sourceRippleId,
      save,
    };
    const task = { _id: new mongoose.Types.ObjectId(), sourceSuggestionId: suggestionId };
    mockFindOne.mockImplementation(async (query) => (
      query.status === 'pending' ? { ...suggestion } : null
    ));
    mockCreate
      .mockResolvedValueOnce(task)
      .mockRejectedValueOnce(Object.assign(new Error('duplicate'), { code: 11000 }));
    mockTaskFindOne.mockImplementation(async () => (
      mockCreate.mock.calls.length ? task : null
    ));

    const [first, second] = await Promise.all([
      request(makeApp()).put(`/api/suggested-tasks/${suggestionId}/accept`),
      request(makeApp()).put(`/api/suggested-tasks/${suggestionId}/accept`),
    ]);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockTaskFindOne).toHaveBeenCalledWith({ userId, sourceSuggestionId: suggestionId });
    expect(first.body.task._id).toBe(String(task._id));
    expect(second.body.task._id).toBe(String(task._id));
    expect(save).not.toHaveBeenCalled();
  });

  it('heals an accepted suggestion and pending ripple after an interrupted acceptance', async () => {
    const sourceRippleId = new mongoose.Types.ObjectId();
    const entryId = new mongoose.Types.ObjectId();
    const suggestion = {
      _id: new mongoose.Types.ObjectId(),
      userId,
      title: 'Finish the repair',
      priority: 'medium',
      status: 'pending',
      sourceRippleId,
      save: vi.fn().mockResolvedValue(undefined),
    };
    const task = {
      _id: new mongoose.Types.ObjectId(),
      userId,
      title: suggestion.title,
      sourceSuggestionId: suggestion._id,
    };
    mockFindOne.mockImplementation(async (query) => (
      query.status === suggestion.status ? suggestion : null
    ));
    mockRippleFindOne.mockReturnValue({
      select: () => ({
        lean: () => Promise.resolve({ _id: sourceRippleId, entryId, dateKey: '2026-07-13' }),
      }),
    });
    mockCreate.mockResolvedValue(task);
    mockTaskFindOne.mockResolvedValue(task);
    mockRippleFindOneAndUpdate
      .mockRejectedValueOnce(new Error('temporary ripple write failure'))
      .mockResolvedValueOnce({ _id: sourceRippleId, status: 'applied' });

    const first = await request(makeApp()).put(`/api/suggested-tasks/${suggestion._id}/accept`);
    const retry = await request(makeApp()).put(`/api/suggested-tasks/${suggestion._id}/accept`);

    expect(first.status).toBe(500);
    expect(retry.status).toBe(200);
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockTaskFindOne).toHaveBeenCalledWith({ userId, sourceSuggestionId: suggestion._id });
    expect(suggestion.status).toBe('accepted');
    expect(suggestion.save).not.toHaveBeenCalled();
    expect(mockRippleFindOneAndUpdate).toHaveBeenCalledTimes(2);
    expect(retry.body.task._id).toBe(String(task._id));
  });

  it('recreates a missing task for an already-accepted suggestion', async () => {
    const suggestion = {
      _id: new mongoose.Types.ObjectId(),
      userId,
      title: 'Repair the missing destination',
      priority: 'high',
      status: 'accepted',
      sourceRippleId: null,
      save: vi.fn().mockResolvedValue(undefined),
    };
    const repairedTask = { _id: new mongoose.Types.ObjectId(), sourceSuggestionId: suggestion._id };
    mockFindOne.mockImplementation(async (query) => (
      query.status === suggestion.status ? suggestion : null
    ));
    mockTaskFindOne.mockResolvedValue(null);
    mockResolveClusterIdForOwner.mockResolvedValue(null);
    mockCreate.mockResolvedValue(repairedTask);

    const res = await request(makeApp()).put(`/api/suggested-tasks/${suggestion._id}/accept`);

    expect(res.status).toBe(200);
    expect(mockTaskFindOne).toHaveBeenCalledWith({ userId, sourceSuggestionId: suggestion._id });
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
      title: suggestion.title,
      sourceSuggestionId: suggestion._id,
    }));
    expect(suggestion.save).not.toHaveBeenCalled();
    expect(res.body.task._id).toBe(String(repairedTask._id));
  });

  it('uses an edited title when accepting a suggestion', async () => {
    const save = vi.fn().mockResolvedValue();
    const suggestedTaskDoc = {
      _id: new mongoose.Types.ObjectId(),
      userId,
      title: 'call mom',
      priority: 'low',
      dueDate: null,
      repeat: '',
      cluster: '',
      status: 'pending',
      sourceRippleId: null,
      save,
    };

    mockFindOne.mockResolvedValue(suggestedTaskDoc);
    mockResolveClusterIdForOwner.mockResolvedValue(null);
    mockCreate.mockResolvedValue({
      _id: new mongoose.Types.ObjectId(),
      userId,
      title: 'Call Mom',
    });

    const res = await request(makeApp())
      .put(`/api/suggested-tasks/${suggestedTaskDoc._id.toString()}/accept`)
      .send({ title: '  Call Mom  ' });

    expect(res.status).toBe(200);
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Call Mom',
    }));
  });

  it('lets the user remove an inferred due date before acceptance', async () => {
    const suggestedTaskDoc = {
      _id: new mongoose.Types.ObjectId(),
      userId,
      title: 'Call mom',
      priority: 'low',
      dueDate: new Date('2026-06-27T00:00:00.000Z'),
      repeat: '',
      cluster: '',
      status: 'pending',
      sourceRippleId: null,
      save: vi.fn().mockResolvedValue(),
    };
    mockFindOne.mockResolvedValue(suggestedTaskDoc);
    mockResolveClusterIdForOwner.mockResolvedValue(null);
    mockCreate.mockResolvedValue({ _id: new mongoose.Types.ObjectId(), userId, title: 'Call mom' });

    const res = await request(makeApp())
      .put(`/api/suggested-tasks/${suggestedTaskDoc._id}/accept`)
      .send({ dueDate: null });

    expect(res.status).toBe(200);
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ dueDate: null }));
  });

  it('supersedes same-entry duplicate pending suggestions when accepting one suggestion', async () => {
    const sourceRippleId = new mongoose.Types.ObjectId();
    const duplicateRippleId = new mongoose.Types.ObjectId();
    const entryId = new mongoose.Types.ObjectId();
    const save = vi.fn().mockResolvedValue();
    const suggestedTaskDoc = {
      _id: new mongoose.Types.ObjectId(),
      userId,
      title: 'Call the dentist',
      priority: 'low',
      dueDate: new Date('2026-06-27T00:00:00.000Z'),
      repeat: '',
      cluster: '',
      status: 'pending',
      sourceRippleId,
      save,
    };

    mockFindOne.mockResolvedValue(suggestedTaskDoc);
    mockResolveClusterIdForOwner.mockResolvedValue(null);
    mockRippleFindOne.mockReturnValue({
      select: () => ({
        lean: () => Promise.resolve({ _id: sourceRippleId, entryId, dateKey: '2026-06-26' }),
      }),
    });
    mockRippleFindResult([{ _id: duplicateRippleId }]);
    mockCreate.mockResolvedValue({
      _id: new mongoose.Types.ObjectId(),
      userId,
      title: suggestedTaskDoc.title,
    });

    const res = await request(makeApp()).put(`/api/suggested-tasks/${suggestedTaskDoc._id.toString()}/accept`);

    expect(res.status).toBe(200);
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockRippleFind).toHaveBeenCalledWith({
      userId,
      entryId,
      dateKey: '2026-06-26',
      text: 'Call the dentist',
      status: 'pending',
      _id: { $ne: sourceRippleId },
    });
    expect(mockUpdateMany).toHaveBeenCalledWith(
      {
        userId,
        sourceRippleId: { $in: [duplicateRippleId] },
        status: 'pending',
        title: 'Call the dentist',
      },
      { $set: { status: 'superseded' } }
    );
    expect(mockRippleUpdateMany).toHaveBeenCalledWith(
      { _id: { $in: [duplicateRippleId] }, userId, status: 'pending' },
      { $set: { status: 'applied' } }
    );
  });

  it('preserves explicit date strings with timezone offsets when accepting a suggestion', async () => {
    const save = vi.fn().mockResolvedValue();
    const suggestedTaskDoc = {
      _id: new mongoose.Types.ObjectId(),
      userId,
      title: 'Call the dentist',
      priority: 'low',
      dueDate: new Date(Date.UTC(2026, 5, 9)),
      repeat: '',
      cluster: '',
      status: 'pending',
      sourceRippleId: null,
      save,
    };

    mockFindOne.mockResolvedValue(suggestedTaskDoc);
    mockResolveClusterIdForOwner.mockResolvedValue(null);
    mockCreate.mockResolvedValue({
      _id: new mongoose.Types.ObjectId(),
      userId,
      title: suggestedTaskDoc.title,
    });

    const res = await request(makeApp())
      .put(`/api/suggested-tasks/${suggestedTaskDoc._id.toString()}/accept`)
      .send({ dueDate: '2026-06-09T00:30:00+14:00' });

    expect(res.status).toBe(200);
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Call the dentist',
      dueDate: '2026-06-09',
    }));
  });

  it('preserves source entry links from the source ripple when accepting a suggestion', async () => {
    const save = vi.fn().mockResolvedValue();
    const sourceRippleId = new mongoose.Types.ObjectId();
    const entryId = new mongoose.Types.ObjectId();
    const suggestedTaskDoc = {
      _id: new mongoose.Types.ObjectId(),
      userId,
      title: 'Call the school',
      priority: 'low',
      dueDate: null,
      repeat: '',
      cluster: '',
      status: 'pending',
      sourceRippleId,
      save,
    };

    mockFindOne.mockResolvedValue(suggestedTaskDoc);
    mockResolveClusterIdForOwner.mockResolvedValue(null);
    mockRippleFindOne.mockReturnValue({
      select: () => ({
        lean: () => Promise.resolve({ _id: sourceRippleId, entryId }),
      }),
    });
    mockCreate.mockResolvedValue({
      _id: new mongoose.Types.ObjectId(),
      userId,
      title: suggestedTaskDoc.title,
      entryId,
    });

    const res = await request(makeApp()).put(`/api/suggested-tasks/${suggestedTaskDoc._id.toString()}/accept`);

    expect(res.status).toBe(200);
    expect(mockRippleFindOne).toHaveBeenCalledWith({ _id: sourceRippleId, userId });
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Call the school',
      entryId,
    }));
    expect(mockRippleFindOneAndUpdate).toHaveBeenCalledWith(
      { _id: sourceRippleId, userId },
      { $set: { status: 'applied' } }
    );
  });

  it('claims rejection before dismissing the source ripple', async () => {
    const suggestion = {
      _id: new mongoose.Types.ObjectId(),
      userId,
      title: 'Do not add this task',
      status: 'pending',
      sourceRippleId: new mongoose.Types.ObjectId(),
    };
    mockFindOne.mockResolvedValue(suggestion);
    mockRippleFindOneAndUpdate.mockResolvedValue({
      _id: suggestion.sourceRippleId,
      status: 'dismissed',
    });

    const res = await request(makeApp()).put(`/api/suggested-tasks/${suggestion._id}/reject`);

    expect(res.status).toBe(200);
    expect(mockSuggestedFindOneAndUpdate).toHaveBeenNthCalledWith(
      1,
      { _id: String(suggestion._id), userId, status: 'pending' },
      { $set: { status: 'rejecting', acceptanceStartedAt: expect.any(Date) } },
      { new: true }
    );
    expect(mockRippleFindOneAndUpdate).toHaveBeenCalledWith(
      { _id: suggestion.sourceRippleId, userId },
      { $set: { status: 'dismissed' } }
    );
    expect(suggestion.status).toBe('rejected');
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
