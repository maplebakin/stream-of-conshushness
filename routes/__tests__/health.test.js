// routes/__tests__/health.test.js
// Basic test to verify server health endpoint

import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';

import { createApp } from '../../app.js';

describe('Health Endpoint', () => {
  let app;
  let originalReadyState;

  beforeAll(() => {
    app = createApp();
    originalReadyState = mongoose.connection.readyState;
  });

  afterEach(() => {
    mongoose.connection.readyState = originalReadyState;
    vi.restoreAllMocks();
  });

  it('should return 200 OK with ok: true', async () => {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('ok', true);
    expect(response.body).toHaveProperty('env');
  });

  it('should report mongo as connected when readyState is truthy', async () => {
    mongoose.connection.readyState = 1;
    const response = await request(app).get('/health');
    expect(response.body.mongo).toBe(true);
  });

  it('should report mongo as disconnected when readyState is falsy', async () => {
    mongoose.connection.readyState = 0;
    const response = await request(app).get('/health');
    expect(response.body.mongo).toBe(false);
  });
});
