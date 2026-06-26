import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';

const mockFind = vi.hoisted(() => vi.fn());

vi.mock('../../models/Ripple.js', () => ({
  default: {
    find: mockFind,
  },
}));

vi.mock('../../utils/rippleExtractor.js', () => ({
  default: {
    extractRipplesFromEntry: () => ({ ripples: [] }),
  },
}));

vi.mock('../../utils/rippleSieve.js', () => ({
  sieveRipples: (ripples) => ripples,
  isActiony: () => true,
}));

const router = (await import('../ripples.js')).default;

function mockRippleFindResult(rows) {
  mockFind.mockReturnValue({
    sort: () => ({
      lean: () => Promise.resolve(rows),
    }),
  });
}

function makeApp(userId) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { userId };
    next();
  });
  app.use('/api', router);
  return app;
}

describe('ripples list filters', () => {
  const userId = new mongoose.Types.ObjectId();

  beforeEach(() => {
    vi.clearAllMocks();
    mockRippleFindResult([]);
  });

  it('filters to pending ripples when status=pending is requested', async () => {
    const pendingRipple = {
      _id: new mongoose.Types.ObjectId(),
      userId,
      dateKey: '2026-06-26',
      text: 'Call the dentist',
      status: 'pending',
    };
    mockRippleFindResult([pendingRipple]);

    const res = await request(makeApp(userId)).get('/api/ripples?date=2026-06-26&status=pending');

    expect(res.status).toBe(200);
    expect(mockFind).toHaveBeenCalledWith({
      userId,
      dateKey: '2026-06-26',
      status: 'pending',
    });
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ text: 'Call the dentist', status: 'pending' });
  });

  it('does not add a status filter when status is omitted', async () => {
    mockRippleFindResult([
      { _id: new mongoose.Types.ObjectId(), userId, dateKey: '2026-06-26', text: 'Pending', status: 'pending' },
      { _id: new mongoose.Types.ObjectId(), userId, dateKey: '2026-06-26', text: 'Applied', status: 'applied' },
    ]);

    const res = await request(makeApp(userId)).get('/api/ripples?date=2026-06-26');

    expect(res.status).toBe(200);
    expect(mockFind).toHaveBeenCalledWith({
      userId,
      dateKey: '2026-06-26',
    });
    expect(res.body).toHaveLength(2);
  });

  it('filters applied and dismissed ripples out of the pending alias list', async () => {
    mockRippleFindResult([]);

    const res = await request(makeApp(userId)).get('/api/ripples/2026-06-26?status=pending');

    expect(res.status).toBe(200);
    expect(mockFind).toHaveBeenCalledWith({
      userId,
      dateKey: '2026-06-26',
      status: 'pending',
    });
  });
});
