import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findById: vi.fn(),
  findOne: vi.fn(),
}));

vi.mock('../../models/User.js', () => ({
  default: {
    findById: (...args) => mocks.findById(...args),
    findOne: (...args) => mocks.findOne(...args),
  },
}));

vi.mock('../../middleware/auth.js', () => ({
  default: (req, _res, next) => {
    req.user = { userId: 'user-1' };
    next();
  },
}));

const { default: authRouter } = await import('../auth.js');

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api', authRouter);
  return app;
}

function userDocument() {
  return {
    _id: 'user-1',
    username: 'alice',
    email: 'verified@example.com',
    pendingEmail: '',
    isAdmin: false,
    profilePicture: '',
    emailVerifiedAt: new Date('2026-01-01T00:00:00.000Z'),
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    save: vi.fn().mockResolvedValue(undefined),
  };
}

describe('PATCH /api/me email safety', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findOne.mockResolvedValue(null);
  });

  it('rejects changing a verified email outside the verification flow', async () => {
    const user = userDocument();
    mocks.findById.mockResolvedValue(user);

    const response = await request(makeApp())
      .patch('/api/me')
      .send({ email: 'unverified@example.com' })
      .expect(400);

    expect(response.body.error).toMatch(/require verification/i);
    expect(user.email).toBe('verified@example.com');
    expect(user.emailVerifiedAt).toEqual(new Date('2026-01-01T00:00:00.000Z'));
    expect(user.save).not.toHaveBeenCalled();
  });

  it('allows username updates when an unchanged email is sent by an older client', async () => {
    const user = userDocument();
    mocks.findById.mockResolvedValue(user);

    const response = await request(makeApp())
      .patch('/api/me')
      .send({ email: 'verified@example.com', username: 'alice-updated' })
      .expect(200);

    expect(mocks.findOne).toHaveBeenCalledWith({ username: 'alice-updated' });
    expect(user.username).toBe('alice-updated');
    expect(user.save).toHaveBeenCalledOnce();
    expect(response.body.user.emailVerified).toBe(true);
  });
});
