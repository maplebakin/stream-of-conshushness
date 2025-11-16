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
      .set('Authorization', 'Bearer test-token')
      .send(credentials);

    expect(response.status).toBe(200);
    expect(response.body.received).toEqual(credentials);
    expect(response.body.path).toContain('/auth/login');
  });
});
