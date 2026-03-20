import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import request from 'supertest';
import Note from '../../models/Note.js';

process.env.NODE_ENV = 'test';

vi.mock('../../middleware/auth.js', () => ({
  default: (req, _res, next) => {
    req.user = { userId: 'test-user' };
    next();
  },
}));

describe('note shim error handling', () => {
  let app;

  beforeAll(async () => {
    ({ default: app } = await import('../../server.js'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 500 when /api/note/:date fails', async () => {
    vi.spyOn(Note, 'findOne').mockReturnValue({
      lean: vi.fn().mockRejectedValue(new Error('db down')),
    });

    const response = await request(app)
      .get('/api/note/2024-11-15')
      .set('Authorization', 'Bearer test-token');

    expect(response.status).toBe(500);
    expect(response.body).toMatchObject({ error: expect.any(String) });
  });

  it('returns 500 when /api/note?date= fails', async () => {
    vi.spyOn(Note, 'findOne').mockReturnValue({
      lean: vi.fn().mockRejectedValue(new Error('db down')),
    });

    const response = await request(app)
      .get('/api/note')
      .query({ date: '2024-11-16' })
      .set('Authorization', 'Bearer test-token');

    expect(response.status).toBe(500);
    expect(response.body).toMatchObject({ error: expect.any(String) });
  });
});
