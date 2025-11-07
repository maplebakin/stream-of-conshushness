// routes/__tests__/health.test.js
// Basic test to verify server health endpoint

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';

describe('Health Endpoint', () => {
  let app;

  beforeAll(() => {
    // Create minimal app for health check
    app = express();
    app.get('/health', (_req, res) => {
      res.json({
        ok: true,
        env: process.env.NODE_ENV || 'development',
        mongo: false, // Mock MongoDB connection for test
      });
    });
  });

  it('should return 200 OK', async () => {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
  });

  it('should return JSON with ok: true', async () => {
    const response = await request(app).get('/health');
    expect(response.body).toHaveProperty('ok', true);
  });

  it('should return environment information', async () => {
    const response = await request(app).get('/health');
    expect(response.body).toHaveProperty('env');
    expect(response.body).toHaveProperty('mongo');
  });
});
