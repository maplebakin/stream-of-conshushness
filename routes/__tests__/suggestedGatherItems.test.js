import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import mongoose from 'mongoose';

const suggestedFind = vi.fn();
const suggestedFindOne = vi.fn();
const suggestedFindOneAndUpdate = vi.fn();
const gatherCreate = vi.fn();
const gatherFindOne = vi.fn();
const entryFind = vi.fn();
const entryFindOne = vi.fn();
const sourceEntryId = new mongoose.Types.ObjectId();

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
    findOne: (...args) => gatherFindOne(...args),
  },
}));

vi.mock('../../models/Entry.js', () => ({
  default: {
    find: (...args) => entryFind(...args),
    findOne: (...args) => entryFindOne(...args),
  },
}));

vi.mock('../../utils/clusterIds.js', () => ({
  normalizeClusterIds: (ids = []) => (Array.isArray(ids) ? ids : [ids]).filter(Boolean),
  resolveClusterIdForOwner: async (_userId, value) => (value === 'missing' ? null : value),
  resolveClusterIdsForOwner: async (_userId, ids = []) => (Array.isArray(ids) ? ids : [ids]).filter(Boolean),
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

function makeSuggestion(overrides = {}) {
  return {
    _id: '507f1f77bcf86cd799439011',
    userId: 'user123',
    title: 'Printer paper',
    normalizedTitle: 'printer paper',
    description: '',
    clusters: [],
    list: 'Things to Buy',
    status: 'pending',
    sourceEntryId,
    sourceText: 'I need to buy printer paper.',
    tags: [],
    save: vi.fn(async function save() { return this; }),
    ...overrides,
  };
}

function makeGatherItem(doc = {}) {
  return {
    _id: 'gather-1',
    ...doc,
    populate: vi.fn(async function populate() { return this; }),
  };
}

describe('suggested gather item routes', () => {
  let app;

  beforeEach(() => {
    vi.resetAllMocks();
    app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.user = { userId: 'user123' };
      next();
    });
    app.use('/api/suggested-gather-items', router);
    entryFindOne.mockReturnValue({
      select: () => ({ lean: async () => ({ _id: sourceEntryId }) }),
    });
    suggestedFindOneAndUpdate.mockImplementation(async (query, update) => {
      const suggestion = await suggestedFindOne(query);
      if (!suggestion) return null;
      Object.assign(suggestion, update?.$set || update || {});
      if (update?.$unset) {
        for (const key of Object.keys(update.$unset)) delete suggestion[key];
      }
      return suggestion;
    });
  });

  it('lists pending suggested gather items by default', async () => {
    suggestedFind.mockReturnValue(makeQuery([{ _id: 'suggestion-1', title: 'Printer paper' }]));

    const res = await request(app).get('/api/suggested-gather-items');

    expect(res.status).toBe(200);
    expect(suggestedFind).toHaveBeenCalledWith({
      userId: 'user123',
      status: { $in: ['pending', 'accepting'] },
    });
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
      status: { $in: ['pending', 'accepting'] },
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

  it('returns one gather item to concurrent acceptance requests', async () => {
    const suggestion = makeSuggestion();
    const item = makeGatherItem({ sourceSuggestionId: suggestion._id, title: suggestion.title });
    suggestedFindOne.mockImplementation(async (query) => (
      query.status === 'pending' ? { ...suggestion } : null
    ));
    gatherCreate
      .mockResolvedValueOnce(item)
      .mockRejectedValueOnce(Object.assign(new Error('duplicate'), { code: 11000 }));
    gatherFindOne.mockImplementation(async () => (
      gatherCreate.mock.calls.length ? item : null
    ));

    const [first, second] = await Promise.all([
      request(app).put(`/api/suggested-gather-items/${suggestion._id}/accept`),
      request(app).put(`/api/suggested-gather-items/${suggestion._id}/accept`),
    ]);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(gatherCreate).toHaveBeenCalledTimes(1);
    expect(gatherFindOne).toHaveBeenCalledWith({
      userId: 'user123',
      sourceSuggestionId: suggestion._id,
    });
    expect(first.body.gatherItem._id).toBe(item._id);
    expect(second.body.gatherItem._id).toBe(item._id);
    expect(suggestion.save).not.toHaveBeenCalled();
  });

  it('returns an existing gather item on an accepted retry without applying new edits', async () => {
    const suggestion = makeSuggestion({ status: 'accepted' });
    const item = makeGatherItem({
      sourceSuggestionId: suggestion._id,
      title: 'Original accepted title',
    });
    suggestedFindOne.mockImplementation(async (query) => (
      query.status === suggestion.status ? suggestion : null
    ));
    gatherFindOne.mockResolvedValue(item);

    const res = await request(app)
      .put(`/api/suggested-gather-items/${suggestion._id}/accept`)
      .send({ title: 'Do not overwrite this', list: 'Different list' });

    expect(res.status).toBe(200);
    expect(gatherCreate).not.toHaveBeenCalled();
    expect(suggestion.save).not.toHaveBeenCalled();
    expect(res.body.gatherItem).toMatchObject({ title: 'Original accepted title' });
  });

  it('recreates a missing gather item for an already-accepted suggestion', async () => {
    const suggestion = makeSuggestion({ status: 'accepted' });
    const repaired = makeGatherItem({ sourceSuggestionId: suggestion._id, title: suggestion.title });
    suggestedFindOne.mockImplementation(async (query) => (
      query.status === suggestion.status ? suggestion : null
    ));
    gatherFindOne.mockResolvedValue(null);
    gatherCreate.mockResolvedValue(repaired);

    const res = await request(app).put(`/api/suggested-gather-items/${suggestion._id}/accept`);

    expect(res.status).toBe(200);
    expect(gatherCreate).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user123',
      sourceSuggestionId: suggestion._id,
    }));
    expect(suggestion.save).not.toHaveBeenCalled();
    expect(res.body.gatherItem._id).toBe(repaired._id);
  });

  it('keeps rejected gather suggestions closed', async () => {
    const suggestion = makeSuggestion({ status: 'rejected' });
    suggestedFindOne.mockImplementation(async (query) => (
      query.status === suggestion.status ? suggestion : null
    ));

    const res = await request(app).put(`/api/suggested-gather-items/${suggestion._id}/accept`);

    expect(res.status).toBe(404);
    expect(gatherFindOne).not.toHaveBeenCalled();
    expect(gatherCreate).not.toHaveBeenCalled();
  });

  it('does not promote a cross-owner source reference into an active gather item', async () => {
    const suggestion = makeSuggestion();
    suggestedFindOne.mockResolvedValue(suggestion);
    entryFindOne.mockReturnValue({ select: () => ({ lean: async () => null }) });

    const res = await request(app).put(`/api/suggested-gather-items/${suggestion._id}/accept`);

    expect(res.status).toBe(409);
    expect(gatherCreate).not.toHaveBeenCalled();
    expect(suggestion.save).not.toHaveBeenCalled();
  });
});
