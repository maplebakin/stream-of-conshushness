import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import express from 'express';

const findMock = vi.fn();
const createMock = vi.fn();
const findOneMock = vi.fn();
const deleteOneMock = vi.fn();

vi.mock('../../models/Interest.js', () => ({
  default: {
    find: (...args) => findMock(...args),
    create: (...args) => createMock(...args),
    findOne: (...args) => findOneMock(...args),
    deleteOne: (...args) => deleteOneMock(...args),
  },
}));

vi.mock('../../utils/clusterIds.js', () => ({
  normalizeClusterIds: (ids = []) => (Array.isArray(ids) ? ids : [ids]).filter(Boolean),
  resolveClusterIdForOwner: async (_userId, value) => (value === 'missing' ? null : value),
  resolveClusterIdsForOwner: async (_userId, ids = []) => (Array.isArray(ids) ? ids : [ids]).filter(Boolean),
}));

vi.mock('../../utils/ownedReferences.js', () => ({
  resolveOwnedEntryId: async (_userId, value) => value ? { toString: () => value } : null,
}));

const router = (await import('../interests.js')).default;

function makeQuery(rows = []) {
  return {
    sort: () => ({
      populate: () => ({
        lean: async () => rows,
      }),
    }),
  };
}

function makeDoc(doc = {}) {
  return {
    ...doc,
    save: vi.fn(async function save() { return this; }),
    populate: vi.fn(async function populate() { return this; }),
  };
}

describe('interest routes', () => {
  let app;

  beforeEach(() => {
    vi.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.user = { userId: 'user123' };
      next();
    });
    app.use('/api/interests', router);
  });

  it('lists interests with filters', async () => {
    findMock.mockReturnValue(makeQuery([{ _id: 'interest-1', title: 'Tap dance' }]));

    const res = await request(app).get('/api/interests?status=curious&category=Learning%20Curiosities');

    expect(res.status).toBe(200);
    expect(findMock).toHaveBeenCalledWith({
      userId: 'user123',
      status: 'curious',
      category: 'Learning Curiosities',
    });
    expect(res.body).toEqual([{ _id: 'interest-1', title: 'Tap dance' }]);
  });

  it('creates an interest', async () => {
    createMock.mockImplementation(async (doc) => makeDoc({ _id: 'interest-created', ...doc }));

    const res = await request(app)
      .post('/api/interests')
      .send({
        title: 'Tap dance',
        category: 'Learning Curiosities',
        sourceEntryId: '507f1f77bcf86cd799439011',
      });

    expect(res.status).toBe(201);
    expect(createMock).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user123',
      title: 'Tap dance',
      normalizedTitle: 'tap dance',
      category: 'Learning Curiosities',
      status: 'curious',
      sourceEntryId: expect.any(Object),
    }));
  });

  it('updates an owned interest', async () => {
    const doc = makeDoc({
      _id: '507f1f77bcf86cd799439011',
      userId: 'user123',
      title: 'Tap dance',
      normalizedTitle: 'tap dance',
      status: 'curious',
      category: 'Learning Curiosities',
    });
    findOneMock.mockResolvedValue(doc);

    const res = await request(app)
      .patch('/api/interests/507f1f77bcf86cd799439011')
      .send({ title: 'Tap dance basics', status: 'exploring' });

    expect(res.status).toBe(200);
    expect(findOneMock).toHaveBeenCalledWith({ _id: '507f1f77bcf86cd799439011', userId: 'user123' });
    expect(doc.title).toBe('Tap dance basics');
    expect(doc.normalizedTitle).toBe('tap dance basics');
    expect(doc.status).toBe('exploring');
    expect(doc.save).toHaveBeenCalled();
  });

  it('deletes an owned interest', async () => {
    deleteOneMock.mockResolvedValue({ deletedCount: 1 });

    const res = await request(app).delete('/api/interests/507f1f77bcf86cd799439011');

    expect(res.status).toBe(200);
    expect(deleteOneMock).toHaveBeenCalledWith({ _id: '507f1f77bcf86cd799439011', userId: 'user123' });
    expect(res.body).toEqual({ ok: true });
  });
});
