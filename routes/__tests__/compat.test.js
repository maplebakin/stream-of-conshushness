import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';
import express from 'express';

const taskMocks = vi.hoisted(() => ({
  findOne: vi.fn(),
  findOneAndUpdate: vi.fn(),
  create: vi.fn(),
  updateMany: vi.fn(),
}));

vi.mock('../../models/Task.js', () => ({
  default: {
    findOne: taskMocks.findOne,
    findOneAndUpdate: taskMocks.findOneAndUpdate,
    create: taskMocks.create,
    updateMany: taskMocks.updateMany,
  },
}));

vi.mock('../../middleware/auth.js', () => ({
  default: (req, res, next) => {
    if (!req.get('Authorization')) return res.status(401).json({ error: 'Unauthorized' });
    req.user = { userId: 'test-user' };
    next();
  }
}));

describe('Compat schedule redirects', () => {
  let app;

  beforeAll(async () => {
    const compatRouter = (await import('../compat.js')).default;

    app = express();
    app.use(express.json());

    app.get('/api/schedule/:date', (req, res) => {
      res.json({ ok: true, source: '/api/schedule', date: req.params.date });
    });

    app.use('/routes', compatRouter);
  });

  it('proxies /routes/schedule/:date to the API endpoint', async () => {
    const response = await request(app)
      .get('/routes/schedule/2024-01-01')
      .set('Authorization', 'Bearer test-token')
      .redirects(1);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      ok: true,
      source: '/api/schedule',
      date: '2024-01-01'
    });
  });
});

describe('Compat auth passthroughs', () => {
  let app;

  beforeAll(async () => {
    const compatRouter = (await import('../compat.js')).default;

    app = express();
    app.use(express.json());

    app.use('/routes', compatRouter);

    app.use((req, res, next) => {
      if (req.url.includes('/auth/login')) {
        return res.json({ ok: true, received: req.body, path: req.url });
      }
      return next();
    });
  });

  it('replays login body to downstream auth route', async () => {
    const credentials = { email: 'user@example.com', password: 'supers3cret' };

    const response = await request(app)
      .post('/routes/login')
      .send(credentials)
      .redirects(1);

    expect(response.status).toBe(200);
    expect(response.body.received).toEqual(credentials);
    expect(response.body.path).toContain('/auth/login');
  });
});

describe('Compat task-from-entry forwarding', () => {
  let app;

  beforeAll(async () => {
    const compatRouter = (await import('../compat.js')).default;

    app = express();
    app.use(express.json());
    app.post('/api/tasks/from-entry', (req, res) => {
      res.status(201).json({ ok: true, received: req.body, canonical: true });
    });
    app.use('/routes', compatRouter);
  });

  it('preserves the legacy URL while delegating ownership checks to the canonical route', async () => {
    const payload = {
      entryId: '507f1f77bcf86cd799439011',
      title: 'Keep the context',
      cluster: '507f191e810c19729de860ea',
    };

    const response = await request(app)
      .post('/routes/tasks/from-entry')
      .set('Authorization', 'Bearer test-token')
      .send(payload)
      .redirects(1);

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ ok: true, received: payload, canonical: true });
  });
});

describe('Compat task completion', () => {
  let app;

  beforeAll(async () => {
    const compatRouter = (await import('../compat.js')).default;
    app = express();
    app.use(express.json());
    app.use('/routes', compatRouter);
  });

  it('uses retry-safe recurring completion and preserves the legacy response', async () => {
    const source = {
      _id: '507f1f77bcf86cd799439011',
      completed: true,
      status: 'done',
      title: 'Legacy recurring task',
      notes: 'Keep context',
      dueDate: '2026-07-13',
      priority: 1,
      clusters: [],
      sections: ['Personal'],
      rrule: 'FREQ=DAILY',
      entryId: 'entry-1',
      goalId: 'goal-1',
    };
    taskMocks.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(source) });
    taskMocks.create.mockImplementation(async (payload) => ({
      _id: 'legacy-successor',
      ...payload,
      populate: vi.fn().mockResolvedValue(undefined),
    }));

    const response = await request(app)
      .post(`/routes/tasks/${source._id}/complete`)
      .set('Authorization', 'Bearer test-token');

    expect(response.status).toBe(200);
    expect(taskMocks.findOneAndUpdate).not.toHaveBeenCalled();
    expect(taskMocks.create).toHaveBeenCalledWith(expect.objectContaining({
      recurrenceSourceTaskId: source._id,
      entryId: 'entry-1',
      goalId: 'goal-1',
      dueDate: '2026-07-14',
    }));
    expect(response.body).toMatchObject({
      ok: true,
      task: { id: source._id, completed: true },
      next: { _id: 'legacy-successor' },
    });
  });

  it('rejects invalid task ids without querying the database', async () => {
    taskMocks.findOne.mockClear();

    const response = await request(app)
      .post('/routes/tasks/not-an-object-id/complete')
      .set('Authorization', 'Bearer test-token');

    expect(response.status).toBe(400);
    expect(taskMocks.findOne).not.toHaveBeenCalled();
  });
});
