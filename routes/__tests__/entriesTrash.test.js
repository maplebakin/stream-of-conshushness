import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';

const mockCountDocuments = vi.hoisted(() => vi.fn());
const mockFind = vi.hoisted(() => vi.fn());
const mockFindOne = vi.hoisted(() => vi.fn());
const mockFindOneAndUpdate = vi.hoisted(() => vi.fn());
const mockCreateEntryWithAutomation = vi.hoisted(() => vi.fn());
const mockUpdateEntryWithAutomation = vi.hoisted(() => vi.fn());

vi.mock('../../utils/entryAutomation.js', () => ({
  createEntryWithAutomation: mockCreateEntryWithAutomation,
  updateEntryWithAutomation: mockUpdateEntryWithAutomation,
  normalizeDate: (value) => value,
  getUserIdFromRequest: (req) => req.user?.userId || null,
}));

vi.mock('../../models/Entry.js', () => ({
  default: {
    countDocuments: mockCountDocuments,
    find: mockFind,
    findOne: mockFindOne,
    findOneAndUpdate: mockFindOneAndUpdate,
  },
}));

const router = (await import('../entries.js')).default;

function makeApp(userId = new mongoose.Types.ObjectId().toString()) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { userId };
    next();
  });
  app.use('/api/entries', router);
  return { app, userId };
}

function makeQueryResult(rows) {
  const chain = {
    limit: () => chain,
    populate: () => Promise.resolve(rows),
    lean: () => Promise.resolve(rows),
  };
  return {
    sort: () => chain,
    limit: () => chain,
    populate: () => Promise.resolve(rows),
    lean: () => Promise.resolve(rows),
  };
}

function makeSingleResult(doc) {
  return {
    populate: () => Promise.resolve(doc),
  };
}

describe('entry trash semantics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateEntryWithAutomation.mockResolvedValue(null);
    mockUpdateEntryWithAutomation.mockResolvedValue(null);
  });

  it('soft-deletes entries instead of removing them', async () => {
    const deletedAt = null;
    const entry = {
      _id: '507f1f77bcf86cd799439011',
      userId: 'user1',
      deletedAt,
      save: vi.fn().mockResolvedValue(undefined),
    };
    mockFindOne.mockResolvedValue(entry);

    const { app } = makeApp('user1');
    const res = await request(app).delete('/api/entries/507f1f77bcf86cd799439011');

    expect(res.status).toBe(200);
    expect(mockFindOne).toHaveBeenCalledWith({
      _id: '507f1f77bcf86cd799439011',
      userId: 'user1',
    });
    expect(entry.deletedAt).toBeInstanceOf(Date);
    expect(entry.save).toHaveBeenCalledTimes(1);
    expect(res.body).toEqual({
      ok: true,
      deleted: '507f1f77bcf86cd799439011',
      trashed: true,
    });
  });

  it('keeps soft-deletes idempotent when an entry is already trashed', async () => {
    const entry = {
      _id: '507f1f77bcf86cd799439012',
      userId: 'user1',
      deletedAt: new Date('2026-06-30T12:00:00Z'),
      save: vi.fn().mockResolvedValue(undefined),
    };
    mockFindOne.mockResolvedValue(entry);

    const { app } = makeApp('user1');
    const res = await request(app).delete('/api/entries/507f1f77bcf86cd799439012');

    expect(res.status).toBe(200);
    expect(entry.save).not.toHaveBeenCalled();
    expect(res.body).toMatchObject({
      ok: true,
      deleted: '507f1f77bcf86cd799439012',
      trashed: true,
    });
  });

  it('filters active entry reads by deletedAt null so entries without deletedAt remain visible', async () => {
    const rows = [
      { _id: 'entry-1', date: '2026-06-30', text: 'Active without deletedAt' },
      { _id: 'entry-2', date: '2026-06-30', text: 'Active with explicit null', deletedAt: null },
    ];
    mockFind.mockReturnValue(makeQueryResult(rows));

    const { app } = makeApp('user1');
    const res = await request(app).get('/api/entries?date=2026-06-30&limit=50');

    expect(res.status).toBe(200);
    expect(mockFind).toHaveBeenCalledWith({
      userId: 'user1',
      deletedAt: null,
      date: '2026-06-30',
    });
    expect(res.body).toEqual(rows);
  });

  it('filters counts by deletedAt null', async () => {
    mockCountDocuments.mockResolvedValue(3);
    const { app } = makeApp('user1');

    const res = await request(app).get('/api/entries/count?date=2026-06-30');

    expect(res.status).toBe(200);
    expect(mockCountDocuments).toHaveBeenCalledWith({
      userId: 'user1',
      deletedAt: null,
      date: '2026-06-30',
    });
    expect(res.body).toEqual({ count: 3 });
  });

  it('returns trashed entries from the trash route', async () => {
    const rows = [
      { _id: 'entry-trash-1', date: '2026-06-29', deletedAt: new Date('2026-06-30T12:00:00Z') },
    ];
    mockFind.mockReturnValue(makeQueryResult(rows));

    const { app } = makeApp('user1');
    const res = await request(app).get('/api/entries/trash');

    expect(res.status).toBe(200);
    expect(mockFind).toHaveBeenCalledWith({
      userId: 'user1',
      deletedAt: { $exists: true, $ne: null },
    });
    expect(res.body).toMatchObject([
      {
        _id: 'entry-trash-1',
        date: '2026-06-29',
        deletedAt: '2026-06-30T12:00:00.000Z',
      },
    ]);
  });

  it('restores trashed entries by clearing deletedAt', async () => {
    const doc = {
      _id: '507f1f77bcf86cd799439013',
      userId: 'user1',
      deletedAt: new Date('2026-06-30T12:00:00Z'),
      clusters: [],
    };
    mockFindOneAndUpdate.mockReturnValue(makeSingleResult(doc));

    const { app } = makeApp('user1');
    const res = await request(app).post('/api/entries/507f1f77bcf86cd799439013/restore');

    expect(res.status).toBe(200);
    expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
      {
        _id: '507f1f77bcf86cd799439013',
        userId: 'user1',
        deletedAt: { $exists: true, $ne: null },
      },
      { $set: { deletedAt: null } },
      { new: true }
    );
    expect(res.body).toMatchObject({
      ok: true,
      entry: {
        _id: '507f1f77bcf86cd799439013',
        userId: 'user1',
        deletedAt: '2026-06-30T12:00:00.000Z',
        clusters: [],
      },
    });
  });
});
