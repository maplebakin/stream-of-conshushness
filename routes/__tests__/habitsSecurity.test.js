import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const mocks = vi.hoisted(() => ({
  findOneAndUpdate: vi.fn(),
}));

vi.mock('../../middleware/auth.js', () => ({
  default: (req, _res, next) => {
    req.user = { userId: 'user-a' };
    next();
  },
}));

vi.mock('../../models/Habit.js', () => ({
  default: {
    findOneAndUpdate: (...args) => mocks.findOneAndUpdate(...args),
  },
}));

const router = (await import('../habits.js')).default;

function app() {
  const instance = express();
  instance.use(express.json());
  instance.use('/api/habits', router);
  return instance;
}

describe('habit ownership updates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findOneAndUpdate.mockResolvedValue({ _id: 'habit-1', userId: 'user-a', title: 'Updated' });
  });

  it('whitelists mutable fields and cannot transfer ownership', async () => {
    const res = await request(app())
      .patch('/api/habits/habit-1')
      .send({ title: 'Updated', userId: 'user-b', $unset: { userId: 1 } });

    expect(res.status).toBe(200);
    expect(mocks.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'habit-1', userId: 'user-a' },
      { $set: { title: 'Updated' } },
      { new: true, runValidators: true }
    );
  });
});
