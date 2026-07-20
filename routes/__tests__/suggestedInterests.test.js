import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import mongoose from 'mongoose';

const suggestedFind = vi.fn();
const suggestedFindOne = vi.fn();
const suggestedFindOneAndUpdate = vi.fn();
const interestCreate = vi.fn();
const interestFindOne = vi.fn();
const entryFind = vi.fn();
const entryFindOne = vi.fn();
const sourceEntryId = new mongoose.Types.ObjectId();

vi.mock('../../models/SuggestedInterest.js', () => ({
  default: {
    find: (...args) => suggestedFind(...args),
    findOne: (...args) => suggestedFindOne(...args),
    findOneAndUpdate: (...args) => suggestedFindOneAndUpdate(...args),
  },
}));

vi.mock('../../models/Interest.js', () => ({
  default: {
    create: (...args) => interestCreate(...args),
    findOne: (...args) => interestFindOne(...args),
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

const router = (await import('../suggestedInterests.js')).default;

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
    _id: 'suggestion-1',
    userId: 'user123',
    title: 'Tap dance',
    normalizedTitle: 'tap dance',
    description: '',
    category: 'Learning Curiosities',
    status: 'pending',
    sourceEntryId,
    sourceText: "I'd like to learn about tap dance.",
    clusters: [],
    cluster: '',
    tags: ['learning'],
    confidence: 0.76,
    reason: 'learnAbout',
    save: vi.fn(async function save() { return this; }),
    ...overrides,
  };
}

function makeInterest(doc = {}) {
  return {
    _id: 'interest-1',
    ...doc,
    populate: vi.fn(async function populate() { return this; }),
  };
}

describe('suggested interest routes', () => {
  let app;

  beforeEach(() => {
    vi.resetAllMocks();
    app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.user = { userId: 'user123' };
      next();
    });
    app.use('/api/suggested-interests', router);
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

  it('lists pending suggested interests by default', async () => {
    suggestedFind.mockReturnValue(makeQuery([{ _id: 'suggestion-1', title: 'Tap dance' }]));

    const res = await request(app).get('/api/suggested-interests');

    expect(res.status).toBe(200);
    expect(suggestedFind).toHaveBeenCalledWith({
      userId: 'user123',
      status: { $in: ['pending', 'accepting'] },
    });
    expect(entryFind).not.toHaveBeenCalled();
    expect(res.body).toEqual([{ _id: 'suggestion-1', title: 'Tap dance' }]);
  });

  it('filters pending suggested interests by source entry date', async () => {
    const entryId = new mongoose.Types.ObjectId();
    entryFind.mockReturnValue(makeEntryQuery([{ _id: entryId }]));
    suggestedFind.mockReturnValue(makeQuery([{
      _id: 'suggestion-1',
      title: 'Pottery',
      sourceEntryId: { _id: String(entryId), date: '2026-06-08' },
    }]));

    const res = await request(app).get('/api/suggested-interests?status=pending&date=2026-06-08');

    expect(res.status).toBe(200);
    expect(entryFind).toHaveBeenCalledWith({ userId: 'user123', date: '2026-06-08' });
    expect(suggestedFind).toHaveBeenCalledWith({
      userId: 'user123',
      status: { $in: ['pending', 'accepting'] },
      sourceEntryId: { $in: [entryId] },
    });
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ title: 'Pottery' });
  });

  it('rejects invalid suggested interest date filters', async () => {
    const res = await request(app).get('/api/suggested-interests?status=pending&date=06-08-2026');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'date must use YYYY-MM-DD format' });
    expect(entryFind).not.toHaveBeenCalled();
    expect(suggestedFind).not.toHaveBeenCalled();
  });

  it('accepts a suggestion by creating Interest and marking suggestion accepted', async () => {
    const suggestion = makeSuggestion();
    suggestedFindOne.mockResolvedValue(suggestion);
    interestCreate.mockImplementation(async (doc) => makeInterest(doc));

    const res = await request(app)
      .put('/api/suggested-interests/507f1f77bcf86cd799439011/accept')
      .send({ status: 'exploring' });

    expect(res.status).toBe(200);
    expect(suggestedFindOne).toHaveBeenCalledWith({
      _id: '507f1f77bcf86cd799439011',
      userId: 'user123',
      status: 'pending',
    });
    expect(interestCreate).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user123',
      title: 'Tap dance',
      normalizedTitle: 'tap dance',
      category: 'Learning Curiosities',
      status: 'exploring',
      sourceEntryId,
      sourceText: "I'd like to learn about tap dance.",
      tags: ['learning'],
      confidence: 0.76,
      reason: 'learnAbout',
    }));
    expect(suggestion.status).toBe('accepted');
    expect(suggestion.save).not.toHaveBeenCalled();
    expect(res.body.interest).toMatchObject({ title: 'Tap dance', status: 'exploring' });
  });

  it('returns one interest to concurrent acceptance requests', async () => {
    const suggestion = makeSuggestion({ _id: '507f1f77bcf86cd799439011' });
    const interest = makeInterest({ sourceSuggestionId: suggestion._id, title: suggestion.title });
    suggestedFindOne.mockImplementation(async (query) => (
      query.status === 'pending' ? { ...suggestion } : null
    ));
    interestCreate
      .mockResolvedValueOnce(interest)
      .mockRejectedValueOnce(Object.assign(new Error('duplicate'), { code: 11000 }));
    interestFindOne.mockImplementation(async () => (
      interestCreate.mock.calls.length ? interest : null
    ));

    const [first, second] = await Promise.all([
      request(app).put(`/api/suggested-interests/${suggestion._id}/accept`),
      request(app).put(`/api/suggested-interests/${suggestion._id}/accept`),
    ]);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(interestCreate).toHaveBeenCalledTimes(1);
    expect(interestFindOne).toHaveBeenCalledWith({
      userId: 'user123',
      sourceSuggestionId: suggestion._id,
    });
    expect(first.body.interest._id).toBe(interest._id);
    expect(second.body.interest._id).toBe(interest._id);
    expect(suggestion.save).not.toHaveBeenCalled();
  });

  it('returns an existing interest on an accepted retry without applying new edits', async () => {
    const suggestion = makeSuggestion({
      _id: '507f1f77bcf86cd799439011',
      status: 'accepted',
    });
    const interest = makeInterest({
      sourceSuggestionId: suggestion._id,
      title: 'Original accepted title',
      status: 'exploring',
    });
    suggestedFindOne.mockImplementation(async (query) => (
      query.status === suggestion.status ? suggestion : null
    ));
    interestFindOne.mockResolvedValue(interest);

    const res = await request(app)
      .put(`/api/suggested-interests/${suggestion._id}/accept`)
      .send({ title: 'Do not overwrite this', status: 'archived' });

    expect(res.status).toBe(200);
    expect(interestCreate).not.toHaveBeenCalled();
    expect(suggestion.save).not.toHaveBeenCalled();
    expect(res.body.interest).toMatchObject({
      title: 'Original accepted title',
      status: 'exploring',
    });
  });

  it('recreates a missing interest for an already-accepted suggestion', async () => {
    const suggestion = makeSuggestion({
      _id: '507f1f77bcf86cd799439011',
      status: 'accepted',
    });
    const repaired = makeInterest({ sourceSuggestionId: suggestion._id, title: suggestion.title });
    suggestedFindOne.mockImplementation(async (query) => (
      query.status === suggestion.status ? suggestion : null
    ));
    interestFindOne.mockResolvedValue(null);
    interestCreate.mockResolvedValue(repaired);

    const res = await request(app).put(`/api/suggested-interests/${suggestion._id}/accept`);

    expect(res.status).toBe(200);
    expect(interestCreate).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user123',
      sourceSuggestionId: suggestion._id,
    }));
    expect(suggestion.save).not.toHaveBeenCalled();
    expect(res.body.interest._id).toBe(repaired._id);
  });

  it('keeps rejected interest suggestions closed', async () => {
    const suggestion = makeSuggestion({
      _id: '507f1f77bcf86cd799439011',
      status: 'rejected',
    });
    suggestedFindOne.mockImplementation(async (query) => (
      query.status === suggestion.status ? suggestion : null
    ));

    const res = await request(app).put(`/api/suggested-interests/${suggestion._id}/accept`);

    expect(res.status).toBe(404);
    expect(interestFindOne).not.toHaveBeenCalled();
    expect(interestCreate).not.toHaveBeenCalled();
  });

  it('does not promote a cross-owner source reference into an active interest', async () => {
    const suggestion = makeSuggestion({ _id: '507f1f77bcf86cd799439011' });
    suggestedFindOne.mockResolvedValue(suggestion);
    entryFindOne.mockReturnValue({ select: () => ({ lean: async () => null }) });

    const res = await request(app).put(`/api/suggested-interests/${suggestion._id}/accept`);

    expect(res.status).toBe(409);
    expect(interestCreate).not.toHaveBeenCalled();
    expect(suggestion.save).not.toHaveBeenCalled();
  });

  it('rejects a suggestion without creating Interest', async () => {
    suggestedFindOneAndUpdate.mockResolvedValue({ _id: 'suggestion-1', status: 'rejected' });

    const res = await request(app).put('/api/suggested-interests/507f1f77bcf86cd799439011/reject');

    expect(res.status).toBe(200);
    expect(suggestedFindOneAndUpdate).toHaveBeenCalledWith(
      { _id: '507f1f77bcf86cd799439011', userId: 'user123', status: 'pending' },
      { status: 'rejected' },
      { new: true }
    );
    expect(interestCreate).not.toHaveBeenCalled();
    expect(res.body).toMatchObject({ status: 'rejected' });
  });
});
