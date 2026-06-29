import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test';
});

const app = (await import('../../server.js')).default;

describe('Health Endpoint', () => {
  it('reports MongoDB readiness explicitly', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      env: 'test',
      mongo: false,
      mongoReady: false,
      mongoState: 0,
      mongoStateLabel: 'disconnected',
    });
  });
});
