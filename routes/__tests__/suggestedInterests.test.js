import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import express from 'express';

const suggestedFind = vi.fn();
const suggestedFindOne = vi.fn();
const suggestedFindOneAndUpdate = vi.fn();
const interestCreate = vi.fn();

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
  },
}));

vi.mock('../../utils/clusterIds.js', () => ({
  normalizeClusterIds: (ids = []) => (Array.isArray(ids) ? ids : [ids]).filter(Boolean),
  resolveClusterIdForOwner: async (_userId, value) => (value === 'missing' ? null : value),
}));

const router = (await import('../suggestedInterests.js')).default;

function makeQuery(rows = []) {
  return {
    sort: () => ({
      populate: () => ({
        lean: async () => rows,
      }),
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
    sourceEntryId: 'entry-1',
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
    vi.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.user = { userId: 'user123' };
      next();
    });
    app.use('/api/suggested-interests', router);
  });

  it('lists pending suggested interests by default', async () => {
    suggestedFind.mockReturnValue(makeQuery([{ _id: 'suggestion-1', title: 'Tap dance' }]));

    const res = await request(app).get('/api/suggested-interests');

    expect(res.status).toBe(200);
    expect(suggestedFind).toHaveBeenCalledWith({ userId: 'user123', status: 'pending' });
    expect(res.body).toEqual([{ _id: 'suggestion-1', title: 'Tap dance' }]);
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
      sourceEntryId: 'entry-1',
      sourceText: "I'd like to learn about tap dance.",
      tags: ['learning'],
      confidence: 0.76,
      reason: 'learnAbout',
    }));
    expect(suggestion.status).toBe('accepted');
    expect(suggestion.save).toHaveBeenCalled();
    expect(res.body.interest).toMatchObject({ title: 'Tap dance', status: 'exploring' });
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
