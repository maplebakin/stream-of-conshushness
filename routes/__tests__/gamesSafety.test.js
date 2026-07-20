import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const mocks = vi.hoisted(() => ({
  find: vi.fn(),
  exists: vi.fn(),
}));

vi.mock('../../middleware/auth.js', () => ({
  default: (req, _res, next) => {
    req.user = { userId: 'user-a' };
    next();
  },
}));

vi.mock('../../models/Game.js', () => ({
  default: Object.assign(
    function Game() {},
    {
      find: (...args) => mocks.find(...args),
      exists: (...args) => mocks.exists(...args),
    }
  ),
}));

vi.mock('../../models/GameNote.js', () => ({ default: {} }));

const router = (await import('../games.js')).default;

function app() {
  const instance = express();
  instance.use(express.json());
  instance.use('/api/games', router);
  return instance;
}

describe('game route failure handling', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects a missing title without throwing an async-handler rejection', async () => {
    const res = await request(app()).post('/api/games').send({ description: 'Missing title' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'title is required' });
    expect(mocks.exists).not.toHaveBeenCalled();
  });

  it('turns database failures into a controlled JSON response', async () => {
    mocks.find.mockReturnValue({ sort: vi.fn().mockRejectedValue(new Error('database down')) });
    const res = await request(app()).get('/api/games');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Server error' });
  });
});
