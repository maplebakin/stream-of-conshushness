import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createEntryWithAutomation: vi.fn(),
  updateEntryWithAutomation: vi.fn(),
  findOne: vi.fn(),
}));

vi.mock('../../utils/entryAutomation.js', () => ({
  createEntryWithAutomation: (...args) => mocks.createEntryWithAutomation(...args),
  updateEntryWithAutomation: (...args) => mocks.updateEntryWithAutomation(...args),
  getUserIdFromRequest: (req) => req.user?.userId || null,
}));

vi.mock('../../models/Entry.js', () => ({
  default: {
    findOne: (...args) => mocks.findOne(...args),
  },
}));

const router = (await import('../entries.js')).default;

function entryDocument(overrides = {}) {
  return {
    _id: 'entry-1',
    userId: 'user-a',
    date: '2026-07-13',
    text: 'Call the dentist tomorrow',
    deletedAt: null,
    populate: vi.fn(async function populate() { return this; }),
    ...overrides,
  };
}

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { userId: 'user-a' };
    next();
  });
  app.use('/api/entries', router);
  return app;
}

describe('entry capture idempotency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the existing owned entry without rerunning automation on a retry', async () => {
    const existing = entryDocument({ clientRequestId: 'capture-request-1234' });
    mocks.findOne.mockResolvedValue(existing);

    const response = await request(makeApp())
      .post('/api/entries')
      .send({
        date: '2026-07-13',
        text: 'Call the dentist tomorrow',
        clientRequestId: 'capture-request-1234',
      })
      .expect(200);

    expect(mocks.findOne).toHaveBeenCalledWith({
      userId: 'user-a',
      clientRequestId: 'capture-request-1234',
    });
    expect(mocks.createEntryWithAutomation).not.toHaveBeenCalled();
    expect(response.headers['idempotency-replayed']).toBe('true');
    expect(response.body._id).toBe('entry-1');
  });

  it('recovers the winning entry when concurrent creates hit the unique receipt index', async () => {
    const existing = entryDocument({ clientRequestId: 'capture-request-5678' });
    mocks.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(existing);
    mocks.createEntryWithAutomation.mockRejectedValue(
      Object.assign(new Error('duplicate receipt'), { code: 11000 })
    );

    const response = await request(makeApp())
      .post('/api/entries')
      .send({
        date: '2026-07-13',
        text: 'Call the dentist tomorrow',
        clientRequestId: 'capture-request-5678',
      })
      .expect(200);

    expect(mocks.findOne).toHaveBeenCalledTimes(2);
    expect(response.headers['idempotency-replayed']).toBe('true');
    expect(response.body._id).toBe('entry-1');
  });

  it('resumes an incomplete automation run on an idempotent capture retry', async () => {
    const existing = entryDocument({
      clientRequestId: 'capture-request-pending',
      automationPending: true,
    });
    const completed = entryDocument({
      clientRequestId: 'capture-request-pending',
      automationPending: false,
    });
    mocks.findOne.mockResolvedValue(existing);
    mocks.updateEntryWithAutomation.mockResolvedValue(completed);

    const response = await request(makeApp())
      .post('/api/entries')
      .send({ text: existing.text, clientRequestId: 'capture-request-pending' })
      .expect(200);

    expect(mocks.updateEntryWithAutomation).toHaveBeenCalledWith({
      userId: 'user-a',
      entryId: 'entry-1',
      updates: {},
    });
    expect(response.body.automationPending).toBe(false);
  });

  it('passes a valid receipt into durable creation and rejects malformed receipts', async () => {
    const created = entryDocument({ _id: 'entry-new' });
    mocks.findOne.mockResolvedValue(null);
    mocks.createEntryWithAutomation.mockResolvedValue(created);

    await request(makeApp())
      .post('/api/entries')
      .send({ text: 'A new thought', clientRequestId: 'capture-request-abcd' })
      .expect(201);

    expect(mocks.createEntryWithAutomation).toHaveBeenCalledWith({
      userId: 'user-a',
      payload: { text: 'A new thought', clientRequestId: 'capture-request-abcd' },
    });

    await request(makeApp())
      .post('/api/entries')
      .send({ text: 'A new thought', clientRequestId: '../unsafe' })
      .expect(400, { error: 'clientRequestId is invalid' });
  });

  it('does not resurrect a capture that the user already moved to trash', async () => {
    mocks.findOne.mockResolvedValue(entryDocument({
      clientRequestId: 'capture-request-trash',
      deletedAt: new Date('2026-07-13T12:00:00.000Z'),
    }));

    await request(makeApp())
      .post('/api/entries')
      .send({ text: 'Old thought', clientRequestId: 'capture-request-trash' })
      .expect(409, { error: 'This capture already exists in trash' });

    expect(mocks.createEntryWithAutomation).not.toHaveBeenCalled();
  });

  it('reports a concurrent edit conflict without presenting a stale save as successful', async () => {
    const error = new Error('version conflict');
    error.name = 'VersionError';
    mocks.updateEntryWithAutomation.mockRejectedValue(error);

    await request(makeApp())
      .patch('/api/entries/507f1f77bcf86cd799439011')
      .send({ text: 'Newest thought' })
      .expect(409, {
        error: 'This entry changed while it was being saved. Reload it before trying again.',
      });
  });
});
