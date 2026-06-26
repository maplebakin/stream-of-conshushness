import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import mongoose from 'mongoose';

const suggestedFind = vi.fn();
const suggestedFindOne = vi.fn();
const suggestedFindOneAndUpdate = vi.fn();
const gatherCreate = vi.fn();
const entryFind = vi.fn();

vi.mock('../../models/SuggestedGatherItem.js', () => ({
  default: {
    find: (...args) => suggestedFind(...args),
    findOne: (...args) => suggestedFindOne(...args),
    findOneAndUpdate: (...args) => suggestedFindOneAndUpdate(...args),
  },
}));

vi.mock('../../models/GatherItem.js', () => ({
  default: {
    create: (...args) => gatherCreate(...args),
  },
}));

vi.mock('../../models/Entry.js', () => ({
  default: {
    find: (...args) => entryFind(...args),
  },
}));

vi.mock('../../utils/clusterIds.js', () => ({
  normalizeClusterIds: (ids = []) => (Array.isArray(ids) ? ids : [ids]).filter(Boolean),
  resolveClusterIdForOwner: async (_userId, value) => (value === 'missing' ? null : value),
}));

const router = (await import('../suggestedGatherItems.js')).default;

function makeQuery(rows = []) {
  const chain = {
    populate: () => chain,
    lean: async () => rows,
  };
  return {
    sort: () => chain,
  };
}

function makeEntryQuery(rows = []) {
  return {
    select: () => ({
      lean: async () => rows,
    }),
  };
}

describe('suggested gather item routes', () => {
  let app;

  beforeEach(() => {
    vi.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.user = { userId: 'user123' };
      next();
    });
    app.use('/api/suggested-gather-items', router);
  });

  it('lists pending suggested gather items by default', async () => {
    suggestedFind.mockReturnValue(makeQuery([{ _id: 'suggestion-1', title: 'Printer paper' }]));

    const res = await request(app).get('/api/suggested-gather-items');

    expect(res.status).toBe(200);
    expect(suggestedFind).toHaveBeenCalledWith({ userId: 'user123', status: 'pending' });
    expect(entryFind).not.toHaveBeenCalled();
    expect(res.body).toEqual([{ _id: 'suggestion-1', title: 'Printer paper' }]);
  });

  it('filters pending suggested gather items by source entry date', async () => {
    const entryId = new mongoose.Types.ObjectId();
    entryFind.mockReturnValue(makeEntryQuery([{ _id: entryId }]));
    suggestedFind.mockReturnValue(makeQuery([{
      _id: 'suggestion-1',
      title: 'Printer paper',
      sourceEntryId: { _id: String(entryId), date: '2026-06-08' },
    }]));

    const res = await request(app).get('/api/suggested-gather-items?status=pending&date=2026-06-08');

    expect(res.status).toBe(200);
    expect(entryFind).toHaveBeenCalledWith({ userId: 'user123', date: '2026-06-08' });
    expect(suggestedFind).toHaveBeenCalledWith({
      userId: 'user123',
      status: 'pending',
      sourceEntryId: { $in: [entryId] },
    });
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ title: 'Printer paper' });
  });

  it('rejects invalid suggested gather item date filters', async () => {
    const res = await request(app).get('/api/suggested-gather-items?status=pending&date=06-08-2026');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'date must use YYYY-MM-DD format' });
    expect(entryFind).not.toHaveBeenCalled();
    expect(suggestedFind).not.toHaveBeenCalled();
  });
});
