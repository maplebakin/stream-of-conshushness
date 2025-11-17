// routes/__tests__/admin.grant.test.js
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const mockExists = vi.hoisted(() => vi.fn());
const mockFindById = vi.hoisted(() => vi.fn());
const mockFindOne = vi.hoisted(() => vi.fn());

vi.mock('../../models/User.js', () => ({
  default: {
    exists: mockExists,
    findById: mockFindById,
    findOne: mockFindOne,
  },
}));

vi.mock('../../middleware/auth.js', () => ({
  default: (req, res, next) => {
    if (!req.headers.authorization) {
      return res.status(401).json({ error: 'not authorized' });
    }
    req.user = { userId: 'mock-user' };
    next();
  },
}));

import router from '../admin.js';

describe('POST /api/admin/grant', () => {
  let app;
  let selectSpy;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ADMIN_SECRET = 'super-secret';
    process.env.ADMIN_GRANT_BOOTSTRAP = 'true';

    selectSpy = vi.fn().mockResolvedValue({
      _id: 'mock-user',
      username: 'mock',
      isAdmin: false,
    });
    mockFindById.mockReturnValue({ select: selectSpy });
    mockExists.mockResolvedValue(false);
    mockFindOne.mockResolvedValue({
      _id: 'target-user',
      username: 'target',
      isAdmin: false,
      save: vi.fn(),
    });

    app = express();
    app.use(express.json());
    app.use('/api/admin', router);
  });

  afterEach(() => {
    delete process.env.ADMIN_SECRET;
    delete process.env.ADMIN_GRANT_BOOTSTRAP;
  });

  it('rejects requests without authentication', async () => {
    const res = await request(app).post('/api/admin/grant').send({ username: 'target' });

    expect(res.status).toBe(401);
  });

  it('rejects invalid admin secrets', async () => {
    const res = await request(app)
      .post('/api/admin/grant')
      .set('Authorization', 'Bearer token')
      .send({ username: 'target', adminSecret: 'wrong-secret' });

    expect(res.status).toBe(403);
    expect(mockFindOne).not.toHaveBeenCalled();
  });

  it('requires an existing admin once one exists', async () => {
    mockExists.mockResolvedValue(true);
    selectSpy.mockResolvedValue({ _id: 'mock-user', username: 'mock', isAdmin: false });

    const res = await request(app)
      .post('/api/admin/grant')
      .set('Authorization', 'Bearer token')
      .send({ username: 'target', adminSecret: 'super-secret' });

    expect(res.status).toBe(403);
    expect(mockFindById).toHaveBeenCalledWith('mock-user');
    expect(mockFindOne).not.toHaveBeenCalled();
  });

  it('applies strict rate limiting to repeated attempts', async () => {
    const payload = { username: 'target', adminSecret: 'super-secret' };

    const attempts = [
      await request(app).post('/api/admin/grant').set('Authorization', 'Bearer token').send(payload),
      await request(app).post('/api/admin/grant').set('Authorization', 'Bearer token').send(payload),
      await request(app).post('/api/admin/grant').set('Authorization', 'Bearer token').send(payload),
      await request(app).post('/api/admin/grant').set('Authorization', 'Bearer token').send(payload),
    ];

    expect(attempts[0].status).not.toBe(429);
    expect(attempts[3].status).toBe(429);
  });
});
