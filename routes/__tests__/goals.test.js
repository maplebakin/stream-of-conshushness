import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import express from 'express';

const mocks = vi.hoisted(() => ({
  authUserId: 'user123',
  store: [],
  find: vi.fn(),
  findOne: vi.fn(),
  findOneAndUpdate: vi.fn(),
  findOneAndDelete: vi.fn(),
}));

vi.mock('../../middleware/auth.js', () => ({
  default: (req, _res, next) => {
    req.user = { userId: mocks.authUserId };
    next();
  },
}));

vi.mock('../../models/Goal.js', () => ({
  default: Object.assign(
    function Goal(data) {
      Object.assign(this, data);
      this._id = data._id || `goal${mocks.store.length + 1}`;
      this.save = async () => {
        const existingIndex = mocks.store.findIndex((item) => item._id === this._id);
        if (existingIndex >= 0) {
          mocks.store[existingIndex] = this;
        } else {
          mocks.store.unshift(this);
        }
        return this;
      };
    },
    {
      find: (...args) => mocks.find(...args),
      findOne: (...args) => mocks.findOne(...args),
      findOneAndUpdate: (...args) => mocks.findOneAndUpdate(...args),
      findOneAndDelete: (...args) => mocks.findOneAndDelete(...args),
    }
  ),
}));

vi.mock('../../utils/clusterIds.js', () => ({
  normalizeClusterIds: (ids = []) => ids,
  resolveClusterIdForOwner: async () => null,
}));

const router = (await import('../goals.js')).default;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/goals', router);
  return app;
}

function resetStore() {
  mocks.authUserId = 'user123';
  mocks.store = [
    {
      _id: 'goal1',
      userId: 'user123',
      title: 'Original',
      description: 'Before',
      steps: [{ content: 'First step', completed: false }],
    },
    {
      _id: 'goal2',
      userId: 'other-user',
      title: 'Someone else',
      description: 'Private',
      steps: [],
    },
  ];
}

describe('goals update/delete routes', () => {
  let app;

  beforeEach(() => {
    vi.clearAllMocks();
    resetStore();
    app = makeApp();

    mocks.find.mockImplementation((query) => ({
      sort: vi.fn().mockResolvedValue(
        mocks.store.filter((goal) => goal.userId === query.userId)
      ),
    }));

    mocks.findOne.mockImplementation((query) => {
      const goal = mocks.store.find((item) => item._id === query._id && item.userId === query.userId);
      if (!goal) return Promise.resolve(null);
      goal.save = async () => goal;
      return Promise.resolve(goal);
    });

    mocks.findOneAndUpdate.mockImplementation((query, updates) => {
      const goal = mocks.store.find((item) => item._id === query._id && item.userId === query.userId);
      if (!goal) return Promise.resolve(null);
      Object.assign(goal, updates);
      return Promise.resolve({ ...goal });
    });

    mocks.findOneAndDelete.mockImplementation((query) => {
      const index = mocks.store.findIndex((item) => item._id === query._id && item.userId === query.userId);
      if (index === -1) return Promise.resolve(null);
      const [deleted] = mocks.store.splice(index, 1);
      return Promise.resolve(deleted);
    });
  });

  it('creates a valid goal scoped to the authenticated user', async () => {
    const res = await request(app)
      .post('/api/goals')
      .send({
        title: '  Learn piano  ',
        description: '  Practice weekly  ',
        steps: [{ content: 'Pick songs', completed: false }],
      });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      userId: 'user123',
      title: 'Learn piano',
      description: 'Practice weekly',
      steps: [{ content: 'Pick songs', completed: false }],
    });
    expect(mocks.store[0]).toMatchObject({ userId: 'user123', title: 'Learn piano' });
  });

  it('creates a goal when description is omitted', async () => {
    const res = await request(app)
      .post('/api/goals')
      .send({ title: 'Write more' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      userId: 'user123',
      title: 'Write more',
      description: '',
      steps: [],
    });
  });

  it('rejects an empty goal title', async () => {
    const res = await request(app)
      .post('/api/goals')
      .send({ title: '', description: 'No title' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Goal title is required' });
  });

  it('rejects a whitespace-only goal title', async () => {
    const res = await request(app)
      .post('/api/goals')
      .send({ title: '   ', description: 'No title' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Goal title is required' });
  });

  it('updates an authenticated user owned goal', async () => {
    const steps = [{ content: 'Updated step', completed: true }];

    const res = await request(app)
      .patch('/api/goals/goal1')
      .send({ title: 'Updated', description: 'After', steps });

    expect(res.status).toBe(200);
    expect(mocks.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'goal1', userId: 'user123' },
      { title: 'Updated', description: 'After', steps },
      { new: true, runValidators: true }
    );
    expect(res.body).toMatchObject({ _id: 'goal1', title: 'Updated', description: 'After', steps });
  });

  it('returns not found when updating another user goal', async () => {
    const res = await request(app)
      .patch('/api/goals/goal2')
      .send({ title: 'Nope' });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Goal not found' });
    expect(mocks.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'goal2', userId: 'user123' },
      { title: 'Nope' },
      { new: true, runValidators: true }
    );
  });

  it('returns not found when updating a nonexistent goal', async () => {
    const res = await request(app)
      .patch('/api/goals/missing')
      .send({ title: 'Missing' });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Goal not found' });
  });

  it('deletes an authenticated user owned goal and removes it from that user goal list', async () => {
    const deleteRes = await request(app).delete('/api/goals/goal1');

    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body).toEqual({ success: true });
    expect(mocks.findOneAndDelete).toHaveBeenCalledWith({ _id: 'goal1', userId: 'user123' });

    const listRes = await request(app).get('/api/goals');

    expect(listRes.status).toBe(200);
    expect(listRes.body).toEqual([]);
  });

  it('returns not found when deleting another user goal', async () => {
    const res = await request(app).delete('/api/goals/goal2');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Goal not found' });
    expect(mocks.findOneAndDelete).toHaveBeenCalledWith({ _id: 'goal2', userId: 'user123' });
  });

  it('returns not found when deleting a nonexistent goal', async () => {
    const res = await request(app).delete('/api/goals/missing');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Goal not found' });
  });

  it('toggles a valid step on an authenticated user owned goal', async () => {
    const res = await request(app).patch('/api/goals/goal1/step/0');

    expect(res.status).toBe(200);
    expect(mocks.findOne).toHaveBeenCalledWith({ _id: 'goal1', userId: 'user123' });
    expect(res.body.steps[0].completed).toBe(true);
  });

  it('returns not found when toggling another user goal step', async () => {
    const res = await request(app).patch('/api/goals/goal2/step/0');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Goal not found' });
    expect(mocks.findOne).toHaveBeenCalledWith({ _id: 'goal2', userId: 'user123' });
  });

  it('returns not found when toggling a nonexistent goal step', async () => {
    const res = await request(app).patch('/api/goals/missing/step/0');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Goal not found' });
  });

  it('rejects a negative step index', async () => {
    const res = await request(app).patch('/api/goals/goal1/step/-1');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid step index' });
  });

  it('rejects a non-numeric step index', async () => {
    const res = await request(app).patch('/api/goals/goal1/step/not-a-number');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid step index' });
  });

  it('rejects an out-of-range step index', async () => {
    const res = await request(app).patch('/api/goals/goal1/step/5');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid step index' });
  });
});
