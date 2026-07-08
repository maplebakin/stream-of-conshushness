// routes/__tests__/suggestedTasks.test.js

import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';

const mockFindOne = vi.hoisted(() => vi.fn());
const mockFind = vi.hoisted(() => vi.fn());
const mockUpdateMany = vi.hoisted(() => vi.fn());
const mockCreate = vi.hoisted(() => vi.fn());
const mockRippleFindOne = vi.hoisted(() => vi.fn());
const mockRippleFind = vi.hoisted(() => vi.fn());
const mockRippleFindOneAndUpdate = vi.hoisted(() => vi.fn());
const mockRippleUpdateMany = vi.hoisted(() => vi.fn());
const mockResolveClusterIdForOwner = vi.hoisted(() => vi.fn());

vi.mock('../../models/SuggestedTask.js', () => ({
  default: {
    find: mockFind,
    findOne: mockFindOne,
    updateMany: mockUpdateMany,
  },
}));

vi.mock('../../models/Task.js', () => ({
  default: {
    create: mockCreate,
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
    vi.clearAllMocks();
    mockResolveClusterIdForOwner.mockResolvedValue(resolvedClusterId);
    mockRippleFindOne.mockReturnValue({
      select: () => ({
        lean: () => Promise.resolve(null),
      }),
    });
    mockRippleFindResult([]);
    mockRippleFindOneAndUpdate.mockResolvedValue(null);
    mockRippleUpdateMany.mockResolvedValue({ modifiedCount: 0 });
    mockUpdateMany.mockResolvedValue({ modifiedCount: 0 });
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
    expect(mockFind).toHaveBeenCalledWith({ userId, status: 'pending' });
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
    expect(mockFind).toHaveBeenCalledWith({ userId, status: 'pending' });
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
      rrule: 'weekly',
      clusters: [resolvedClusterId],
    });
    expect(suggestedTaskDoc.status).toBe('accepted');
    expect(save).toHaveBeenCalled();
    expect(mockRippleFindOneAndUpdate).toHaveBeenCalledWith(
      { _id: suggestedTaskDoc.sourceRippleId, userId },
      { $set: { status: 'applied' } }
    );
    expect(res.body).toHaveProperty('task');
    expect(res.body).toHaveProperty('suggestedTask');
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

  it('marks same-entry duplicate pending suggestions accepted when accepting one suggestion', async () => {
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
      { $set: { status: 'accepted' } }
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
});
