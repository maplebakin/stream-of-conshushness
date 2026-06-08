import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import express from 'express';

const mocks = vi.hoisted(() => ({
  authUserId: 'user123',
  store: [],
  find: vi.fn(),
  findOne: vi.fn(),
  findOneAndUpdate: vi.fn(),
  create: vi.fn(),
  deleteOne: vi.fn(),
}));

vi.mock('../../middleware/auth.js', () => ({
  default: (req, _res, next) => {
    req.user = { userId: mocks.authUserId };
    next();
  },
}));

vi.mock('../../models/Note.js', () => ({
  default: {
    find: (...args) => mocks.find(...args),
    findOne: (...args) => mocks.findOne(...args),
    findOneAndUpdate: (...args) => mocks.findOneAndUpdate(...args),
    create: (...args) => mocks.create(...args),
    deleteOne: (...args) => mocks.deleteOne(...args),
  },
}));

vi.mock('../../utils/clusterIds.js', () => ({
  normalizeClusterIds: (ids = []) => ids,
  resolveClusterIdForOwner: async () => null,
}));

const router = (await import('../notes.js')).default;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { userId: mocks.authUserId };
    next();
  });
  app.use('/api/notes', router);
  app.use('/api/note', router);
  return app;
}

function resetStore() {
  mocks.authUserId = 'user123';
  mocks.store = [
    {
      _id: '507f1f77bcf86cd799439011',
      userId: 'user123',
      date: '2026-06-07',
      content: 'My note',
    },
    {
      _id: '507f1f77bcf86cd799439012',
      userId: 'other-user',
      date: '2026-06-07',
      content: 'Private other note',
    },
  ];
}

describe('date-based notes routes', () => {
  let app;

  beforeEach(() => {
    vi.clearAllMocks();
    resetStore();
    app = makeApp();

    mocks.find.mockImplementation((query) => {
      const items = mocks.store.filter((item) => (
        item.userId === query.userId &&
        (!query.date || item.date === query.date)
      ));
      return {
        sort: () => ({
          limit: () => ({
            lean: () => Promise.resolve(items.map((item) => ({ ...item }))),
          }),
        }),
      };
    });

    mocks.findOne.mockImplementation((query) => {
      const note = mocks.store.find((item) => (
        item.userId === query.userId &&
        (!query.date || item.date === query.date) &&
        (!query._id || item._id === query._id)
      ));
      return Promise.resolve(note || null);
    });

    mocks.findOneAndUpdate.mockImplementation((query, update) => {
      const set = update?.$set || {};
      let note = mocks.store.find((item) => (
        item.userId === query.userId &&
        (!query.date || item.date === query.date) &&
        (!query._id || item._id === query._id)
      ));
      if (!note) {
        if (query._id) return Promise.resolve(null);
        note = {
          _id: `507f1f77bcf86cd7994390${mocks.store.length + 11}`,
          userId: query.userId,
          date: query.date,
          content: '',
        };
        mocks.store.push(note);
      }
      Object.assign(note, set);
      return Promise.resolve({ ...note });
    });

    mocks.create.mockImplementation((doc) => {
      const note = {
        _id: `507f1f77bcf86cd7994390${mocks.store.length + 11}`,
        ...doc,
      };
      mocks.store.push(note);
      return Promise.resolve({ ...note });
    });

    mocks.deleteOne.mockImplementation((query) => {
      const index = mocks.store.findIndex((item) => item._id === query._id && item.userId === query.userId);
      if (index === -1) return Promise.resolve({ deletedCount: 0 });
      mocks.store.splice(index, 1);
      return Promise.resolve({ deletedCount: 1 });
    });
  });

  it('reads an authenticated user owned note by date', async () => {
    const res = await request(app).get('/api/note/2026-06-07');

    expect(res.status).toBe(200);
    expect(mocks.findOne).toHaveBeenCalledWith({ userId: 'user123', date: '2026-06-07' });
    expect(res.body).toMatchObject({
      ok: true,
      item: { _id: '507f1f77bcf86cd799439011', userId: 'user123', date: '2026-06-07' },
      content: 'My note',
    });
  });

  it('returns the existing empty shape when no note exists for the date', async () => {
    const res = await request(app).get('/api/note/2026-06-08');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, item: null, content: '' });
  });

  it('does not read another user note for the same date', async () => {
    mocks.authUserId = 'new-user';

    const res = await request(app).get('/api/note/2026-06-07');

    expect(res.status).toBe(200);
    expect(mocks.findOne).toHaveBeenCalledWith({ userId: 'new-user', date: '2026-06-07' });
    expect(res.body).toEqual({ ok: true, item: null, content: '' });
  });

  it('creates a date note scoped to the authenticated user', async () => {
    const res = await request(app)
      .post('/api/note/2026-06-08')
      .send({ content: 'New note' });

    expect(res.status).toBe(201);
    expect(mocks.findOneAndUpdate).toHaveBeenCalledWith(
      { userId: 'user123', date: '2026-06-08' },
      {
        $set: expect.objectContaining({
          userId: 'user123',
          date: '2026-06-08',
          content: 'New note',
        }),
        $currentDate: { updatedAt: true },
      },
      { new: true, upsert: true }
    );
    expect(res.body).toMatchObject({ ok: true, content: 'New note' });
  });

  it('posting again for the same date updates the existing note instead of creating a duplicate', async () => {
    const first = await request(app)
      .post('/api/note/2026-06-09')
      .send({ content: 'First' });
    const second = await request(app)
      .post('/api/note/2026-06-09')
      .send({ content: 'Second' });

    const matches = mocks.store.filter((item) => item.userId === 'user123' && item.date === '2026-06-09');

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(matches).toHaveLength(1);
    expect(matches[0].content).toBe('Second');
    expect(second.body.content).toBe('Second');
  });

  it('keeps separate users notes on the same date', async () => {
    await request(app)
      .post('/api/note/2026-06-10')
      .send({ content: 'User note' });

    mocks.authUserId = 'other-user';

    const res = await request(app)
      .post('/api/note/2026-06-10')
      .send({ content: 'Other user note' });

    expect(res.status).toBe(201);
    expect(mocks.store.find((item) => item.userId === 'user123' && item.date === '2026-06-10')?.content).toBe('User note');
    expect(mocks.store.find((item) => item.userId === 'other-user' && item.date === '2026-06-10')?.content).toBe('Other user note');
  });

  it('preserves empty and whitespace content during upsert', async () => {
    const res = await request(app)
      .post('/api/note/2026-06-11')
      .send({ content: '  spaced note  ' });

    expect(res.status).toBe(201);
    expect(res.body.content).toBe('  spaced note  ');

    const emptyRes = await request(app)
      .post('/api/note/2026-06-11')
      .send({ content: '' });

    expect(emptyRes.status).toBe(201);
    expect(emptyRes.body.content).toBe('');
  });

  it('lists only authenticated user notes', async () => {
    const res = await request(app).get('/api/notes');

    expect(res.status).toBe(200);
    expect(mocks.find).toHaveBeenCalledWith({ userId: 'user123' });
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({ _id: '507f1f77bcf86cd799439011', userId: 'user123' });
  });

  it('reads an authenticated user owned note by id', async () => {
    const res = await request(app).get('/api/notes/507f1f77bcf86cd799439011');

    expect(res.status).toBe(200);
    expect(mocks.findOne).toHaveBeenCalledWith({ _id: '507f1f77bcf86cd799439011', userId: 'user123' });
    expect(res.body.item).toMatchObject({ _id: '507f1f77bcf86cd799439011', content: 'My note' });
  });

  it('returns not found when reading another user note by id', async () => {
    const res = await request(app).get('/api/notes/507f1f77bcf86cd799439012');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not found' });
  });

  it('returns not found when reading a nonexistent note id', async () => {
    const res = await request(app).get('/api/notes/507f1f77bcf86cd799439099');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not found' });
  });

  it('rejects invalid note ids on read', async () => {
    const res = await request(app).get('/api/notes/not-a-valid-id');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'invalid id' });
  });

  it('creates an authenticated user owned note with id-based create route', async () => {
    const res = await request(app)
      .post('/api/notes')
      .send({ date: '2026-06-12', content: '' });

    expect(res.status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user123',
      date: '2026-06-12',
      content: '',
    }));
    expect(res.body.item).toMatchObject({ userId: 'user123', date: '2026-06-12', content: '' });
  });

  it('updates an authenticated user owned note by id without changing ownership', async () => {
    const res = await request(app)
      .patch('/api/notes/507f1f77bcf86cd799439011')
      .send({ userId: 'other-user', content: 'Updated note' });

    expect(res.status).toBe(200);
    expect(mocks.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: '507f1f77bcf86cd799439011', userId: 'user123' },
      {
        $set: expect.not.objectContaining({ userId: 'other-user' }),
        $currentDate: { updatedAt: true },
      },
      { new: true, runValidators: true }
    );
    expect(mocks.store.find((item) => item._id === '507f1f77bcf86cd799439011')).toMatchObject({
      userId: 'user123',
      content: 'Updated note',
    });
  });

  it('returns not found when updating another user note by id', async () => {
    const res = await request(app)
      .patch('/api/notes/507f1f77bcf86cd799439012')
      .send({ content: 'Nope' });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not found' });
  });

  it('returns not found when updating a nonexistent note id', async () => {
    const res = await request(app)
      .patch('/api/notes/507f1f77bcf86cd799439099')
      .send({ content: 'Missing' });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not found' });
  });

  it('deletes an authenticated user owned note by id and removes it from the list', async () => {
    const deleteRes = await request(app).delete('/api/notes/507f1f77bcf86cd799439011');

    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body).toEqual({ ok: true });
    expect(mocks.deleteOne).toHaveBeenCalledWith({ _id: '507f1f77bcf86cd799439011', userId: 'user123' });

    const listRes = await request(app).get('/api/notes');

    expect(listRes.status).toBe(200);
    expect(listRes.body.items).toEqual([]);
  });

  it('returns not found when deleting another user note by id', async () => {
    const res = await request(app).delete('/api/notes/507f1f77bcf86cd799439012');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not found' });
  });

  it('returns not found when deleting a nonexistent note id', async () => {
    const res = await request(app).delete('/api/notes/507f1f77bcf86cd799439099');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not found' });
  });

  it('rejects invalid note ids on update and delete', async () => {
    const updateRes = await request(app)
      .patch('/api/notes/not-a-valid-id')
      .send({ content: 'Nope' });
    const deleteRes = await request(app).delete('/api/notes/not-a-valid-id');

    expect(updateRes.status).toBe(400);
    expect(updateRes.body).toEqual({ error: 'invalid id' });
    expect(deleteRes.status).toBe(400);
    expect(deleteRes.body).toEqual({ error: 'invalid id' });
  });
});
