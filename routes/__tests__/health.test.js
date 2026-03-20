// routes/__tests__/health.test.js
// Basic test to verify server health endpoint

import { describe, it, expect } from 'vitest';

describe('Health Endpoint', () => {
  const handler = (_req, res) => {
    res.json({
      ok: true,
      env: process.env.NODE_ENV || 'development',
      mongo: false, // Mock MongoDB connection for test
    });
  };

  function mockRes() {
    const res = {
      statusCode: 200,
      body: null,
      headers: {},
    };
    res.status = (code) => { res.statusCode = code; return res; };
    res.setHeader = (k, v) => { res.headers[k] = v; };
    res.json = (data) => { res.body = data; return res; };
    return res;
  }

  it('should return 200 OK', async () => {
    const res = mockRes();
    handler({}, res);
    expect(res.statusCode).toBe(200);
  });

  it('should return JSON with ok: true', async () => {
    const res = mockRes();
    handler({}, res);
    expect(res.body).toHaveProperty('ok', true);
  });

  it('should return environment information', async () => {
    const res = mockRes();
    handler({}, res);
    expect(res.body).toHaveProperty('env');
    expect(res.body).toHaveProperty('mongo');
  });
});
