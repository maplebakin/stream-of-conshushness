// routes/__tests__/auth.me.test.js

import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const mockFindById = vi.hoisted(() => vi.fn());

vi.mock('../../models/User.js', () => ({
  default: {
    findById: mockFindById,
  },
}));

vi.mock('../../middleware/auth.js', () => ({
  default: (req, _res, next) => {
    req.user = { userId: 'test-user-id' };
    next();
  },
}));

import router from '../auth.js';

describe('GET /api/me', () => {
  let app;

  beforeEach(() => {
    vi.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/api', router);
  });

  it('returns pendingEmail and emailVerified flags for the Account page', async () => {
    const mockSelect = vi.fn().mockResolvedValue({
      _id: 'abc123',
      username: 'alice',
      email: 'alice@example.com',
      pendingEmail: 'new@example.com',
      isAdmin: false,
      profilePicture: '',
      emailVerifiedAt: new Date('2024-01-01T00:00:00Z'),
      createdAt: new Date('2024-01-01T00:00:00Z'),
      updatedAt: new Date('2024-01-02T00:00:00Z'),
    });
    mockFindById.mockReturnValue({ select: mockSelect });

    const res = await request(app).get('/api/me');

    expect(res.status).toBe(200);
    expect(mockFindById).toHaveBeenCalledWith('test-user-id');
    expect(mockSelect).toHaveBeenCalledWith(
      '_id username email pendingEmail isAdmin profilePicture emailVerifiedAt createdAt updatedAt'
    );
    expect(res.body.user).toMatchObject({
      pendingEmail: 'new@example.com',
      emailVerified: true,
    });
  });

  it('sets emailVerified to false when there is no verification timestamp', async () => {
    const mockSelect = vi.fn().mockResolvedValue({
      _id: 'abc123',
      username: 'alice',
      email: 'alice@example.com',
      pendingEmail: '',
      isAdmin: false,
      profilePicture: '',
      emailVerifiedAt: null,
      createdAt: new Date('2024-01-01T00:00:00Z'),
      updatedAt: new Date('2024-01-02T00:00:00Z'),
    });
    mockFindById.mockReturnValue({ select: mockSelect });

    const res = await request(app).get('/api/me');

    expect(res.status).toBe(200);
    expect(res.body.user.emailVerified).toBe(false);
  });
});
