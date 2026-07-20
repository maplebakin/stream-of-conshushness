import { describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import request from 'supertest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test';
  process.env.TRUST_PROXY_HOPS = '0';
  process.env.CLIENT_ORIGIN = 'https://client.example.test';
});

const app = (await import('../../server.js')).default;

describe('Health Endpoint', () => {
  it('does not trust client forwarding headers unless proxy hops are configured', () => {
    expect(app.get('trust proxy')).toBe(false);
  });

  it('reports MongoDB readiness explicitly', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({
      ok: false,
      mongoReady: false,
    });
    expect(res.body).not.toHaveProperty('env');
    expect(res.body).not.toHaveProperty('mongoState');
  });

  it('returns 200 once the database dependency is ready', async () => {
    mongoose.connection.readyState = 1;
    try {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, mongoReady: true });
    } finally {
      mongoose.connection.readyState = 0;
    }
  });

  it('keeps a database-independent liveness endpoint', async () => {
    const res = await request(app).get('/health/live');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('keeps security headers and an exact non-credentialed browser origin boundary', async () => {
    const allowed = await request(app)
      .get('/health/live')
      .set('Origin', 'https://client.example.test');
    expect(allowed.headers['access-control-allow-origin']).toBe('https://client.example.test');
    expect(allowed.headers['access-control-allow-credentials']).toBeUndefined();
    expect(allowed.headers['x-content-type-options']).toBe('nosniff');
    expect(allowed.headers['content-security-policy']).toBeTruthy();
    expect(allowed.headers['content-security-policy']).toContain("img-src 'self' data: blob:");
    expect(allowed.headers['x-powered-by']).toBeUndefined();

    const foreign = await request(app)
      .get('/health/live')
      .set('Origin', 'https://attacker.example.test');
    expect(foreign.headers['access-control-allow-origin']).not.toBe('https://attacker.example.test');
  });

  it('does not expose the internal route inventory without an explicit local opt-in', async () => {
    const res = await request(app).get('/__routes_full');
    expect([200, 404]).toContain(res.status);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.body).not.toBeInstanceOf(Array);
  });
});
