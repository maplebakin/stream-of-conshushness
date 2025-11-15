import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../middleware/auth.js', () => ({
  default: (req, _res, next) => {
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
