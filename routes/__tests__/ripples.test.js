import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';

const mocks = vi.hoisted(() => ({
  find: vi.fn(),
  insertMany: vi.fn(),
  updateMany: vi.fn(),
  deleteMany: vi.fn(),
  suggestedFind: vi.fn(),
  extract: vi.fn(),
  isActiony: vi.fn(),
}));

vi.mock('../../models/Ripple.js', () => ({
  default: {
    find: mocks.find,
    insertMany: mocks.insertMany,
    updateMany: mocks.updateMany,
    deleteMany: mocks.deleteMany,
  },
}));

vi.mock('../../models/SuggestedTask.js', () => ({
  default: {
    find: mocks.suggestedFind,
  },
}));

vi.mock('../../utils/rippleExtractor.js', () => ({
  default: {
    extractRipplesFromEntry: mocks.extract,
  },
}));

vi.mock('../../utils/rippleSieve.js', () => ({
  sieveRipples: (ripples) => ripples,
  isActiony: mocks.isActiony,
}));

const router = (await import('../ripples.js')).default;

function mockRippleFindResult(rows) {
  mocks.find.mockReturnValue({
    lean: () => Promise.resolve(rows),
    sort: () => ({
      lean: () => Promise.resolve(rows),
    }),
  });
}

function mockSuggestedFindResult(rows) {
  mocks.suggestedFind.mockReturnValue({
    select: () => ({
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
    mockSuggestedFindResult([]);
    mocks.extract.mockReturnValue({ ripples: [] });
    mocks.isActiony.mockReturnValue(true);
    mocks.insertMany.mockResolvedValue([]);
    mocks.updateMany.mockResolvedValue({ modifiedCount: 0 });
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
    expect(mocks.find).toHaveBeenCalledWith({
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
    expect(mocks.find).toHaveBeenCalledWith({
      userId,
      dateKey: '2026-06-26',
    });
    expect(res.body).toHaveLength(2);
  });

  it('filters applied and dismissed ripples out of the pending alias list', async () => {
    mockRippleFindResult([]);

    const res = await request(makeApp(userId)).get('/api/ripples/2026-06-26?status=pending');

    expect(res.status).toBe(200);
    expect(mocks.find).toHaveBeenCalledWith({
      userId,
      dateKey: '2026-06-26',
      status: 'pending',
    });
  });
});

describe('ripple analysis integrity', () => {
  const userId = new mongoose.Types.ObjectId();

  beforeEach(() => {
    vi.clearAllMocks();
    mockSuggestedFindResult([]);
    mocks.extract.mockReturnValue({
      ripples: [{
        type: 'suggestedTask',
        extractedText: 'Call the dentist',
        confidence: 0.9,
      }],
    });
    mocks.isActiony.mockReturnValue(true);
  });

  it('creates exactly one ripple for concurrent retries of the same analysis', async () => {
    const stored = [];
    let preflightCount = 0;
    let releasePreflights;
    const bothPreflightsStarted = new Promise((resolve) => {
      releasePreflights = resolve;
    });

    mocks.find.mockImplementation((query) => {
      if (query.text?.$in) {
        return {
          lean: async () => {
            preflightCount += 1;
            if (preflightCount === 2) releasePreflights();
            await bothPreflightsStarted;
            return [];
          },
        };
      }
      return {
        sort: () => ({
          lean: () => Promise.resolve([...stored]),
        }),
      };
    });
    mocks.insertMany.mockImplementation(async (docs) => {
      const insertedDocs = [];
      for (const doc of docs) {
        if (stored.some((item) => item.analysisKey === doc.analysisKey)) {
          const duplicate = Object.assign(new Error('duplicate analysis receipt'), {
            code: 11000,
            writeErrors: [{ code: 11000 }],
            insertedDocs,
          });
          throw duplicate;
        }
        const storedDoc = { ...doc, _id: new mongoose.Types.ObjectId() };
        stored.push(storedDoc);
        insertedDocs.push(storedDoc);
      }
      return insertedDocs;
    });

    const app = makeApp(userId);
    const [first, second] = await Promise.all([
      request(app).post('/api/ripples/analyze').send({ text: 'Call the dentist', date: '2026-07-13' }),
      request(app).post('/api/ripples/analyze').send({ text: 'Call the dentist', date: '2026-07-13' }),
    ]);

    expect([first.status, second.status].sort()).toEqual([200, 201]);
    expect(first.body.created + second.body.created).toBe(1);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      userId,
      dateKey: '2026-07-13',
      text: 'Call the dentist',
      source: 'analyze',
      status: 'pending',
    });
    expect(stored[0].analysisKey).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('ripple pruning integrity', () => {
  const userId = new mongoose.Types.ObjectId();

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.extract.mockReturnValue({ ripples: [] });
    mocks.updateMany.mockResolvedValue({ modifiedCount: 1 });
  });

  it('soft-dismisses only unrepresented pending junk and preserves provenance', async () => {
    const junkId = new mongoose.Types.ObjectId();
    const representedId = new mongoose.Types.ObjectId();
    const usefulId = new mongoose.Types.ObjectId();
    mockRippleFindResult([
      { _id: junkId, status: 'pending', text: 'maybe whatever' },
      { _id: representedId, status: 'pending', text: 'hmm maybe' },
      { _id: usefulId, status: 'pending', text: 'Call the dentist' },
    ]);
    mockSuggestedFindResult([{ sourceRippleId: representedId }]);
    mocks.isActiony.mockImplementation((text) => text === 'Call the dentist');

    const res = await request(makeApp(userId))
      .post('/api/ripples/prune')
      .send({ date: '2026-07-13' });

    expect(res.status).toBe(200);
    expect(mocks.find).toHaveBeenCalledWith({
      userId,
      dateKey: '2026-07-13',
      status: 'pending',
    });
    expect(mocks.suggestedFind).toHaveBeenCalledWith({
      userId,
      sourceRippleId: { $in: [junkId, representedId] },
    });
    expect(mocks.updateMany).toHaveBeenCalledWith(
      {
        userId,
        dateKey: '2026-07-13',
        status: 'pending',
        _id: { $in: [junkId] },
      },
      { $set: { status: 'dismissed' } }
    );
    expect(mocks.deleteMany).not.toHaveBeenCalled();
    expect(res.body).toMatchObject({ ok: true, pruned: 1, kept: 2, protected: 1 });
  });
});
