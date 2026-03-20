import { describe, it, expect, vi, beforeEach } from 'vitest';

const fixtures = vi.hoisted(() => {
  const makeCursor = async function* (items) {
    for (const item of items) {
      yield item;
    }
  };

  const defaultFind = {
    _leanResult: [],
    sort: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    lean: vi.fn().mockReturnThis(),
    cursor: vi.fn(() => makeCursor(defaultFind._leanResult)),
    then: (resolve, reject) => Promise.resolve(defaultFind._leanResult).then(resolve, reject),
  };
  return {
    userDoc: {
      _id: 'user1',
      username: 'alice',
      email: 'a@example.com',
      isAdmin: false,
      profilePicture: '',
      resetCodeHash: 'secret',
      resetTokenHash: 'secret',
      pendingEmail: 'new@example.com',
    },
    defaultFind,
  };
});

vi.mock('../../models/User.js', () => {
  const { userDoc } = fixtures;
  const projectedUser = {
    _id: userDoc._id,
    username: userDoc.username,
    email: userDoc.email,
    isAdmin: userDoc.isAdmin,
    profilePicture: userDoc.profilePicture,
    createdAt: userDoc.createdAt,
    updatedAt: userDoc.updatedAt,
    emailVerifiedAt: userDoc.emailVerifiedAt,
  };
  return {
    default: {
      findById: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue(projectedUser),
      })),
    },
  };
});
vi.mock('../../models/Entry.js', () => ({ default: { find: vi.fn(() => fixtures.defaultFind), countDocuments: vi.fn(() => Promise.resolve(1)) } }));
vi.mock('../../models/Task.js', () => ({ default: { find: vi.fn(() => fixtures.defaultFind), countDocuments: vi.fn(() => Promise.resolve(2)) } }));
vi.mock('../../models/Goal.js', () => ({ default: { find: vi.fn(() => fixtures.defaultFind), countDocuments: vi.fn(() => Promise.resolve(3)) } }));
vi.mock('../../models/Note.js', () => ({ default: { find: vi.fn(() => fixtures.defaultFind), countDocuments: vi.fn(() => Promise.resolve(4)) } }));
vi.mock('../../models/Habit.js', () => ({ default: { find: vi.fn(() => fixtures.defaultFind), countDocuments: vi.fn(() => Promise.resolve(5)) } }));
vi.mock('../../models/Cluster.js', () => ({ default: { find: vi.fn(() => fixtures.defaultFind), countDocuments: vi.fn(() => Promise.resolve(6)) } }));
vi.mock('../../models/Section.js', () => ({ default: { find: vi.fn(() => fixtures.defaultFind), countDocuments: vi.fn(() => Promise.resolve(7)) } }));
vi.mock('../../models/SectionPage.js', () => ({ default: { find: vi.fn(() => fixtures.defaultFind), countDocuments: vi.fn(() => Promise.resolve(8)) } }));
vi.mock('../../models/Appointment.js', () => ({ default: { find: vi.fn(() => fixtures.defaultFind), countDocuments: vi.fn(() => Promise.resolve(9)) } }));
vi.mock('../../models/ImportantEvent.js', () => ({ default: { find: vi.fn(() => fixtures.defaultFind), countDocuments: vi.fn(() => Promise.resolve(10)) } }));
vi.mock('../../models/Ripple.js', () => ({ default: { find: vi.fn(() => fixtures.defaultFind), countDocuments: vi.fn(() => Promise.resolve(11)) } }));

import exportRouter from '../export.js';

function mockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    chunks: [],
    ended: false,
  };
  res.status = (code) => { res.statusCode = code; return res; };
  res.setHeader = (k, v) => { res.headers[k] = v; };
  res.json = (data) => { res.body = data; return res; };
  res.send = (data) => { res.body = data; return res; };
  res.write = (chunk) => { res.chunks.push(String(chunk)); return true; };
  res.end = (chunk = '') => {
    if (chunk) res.chunks.push(String(chunk));
    res.body = res.chunks.join('');
    res.ended = true;
    return res;
  };
  return res;
}

function findHandler(path) {
  const layer = exportRouter.stack.find(
    (l) => l.route && l.route.path === path
  );
  return layer?.route?.stack?.[0]?.handle;
}

describe('export router security', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fixtures.defaultFind._leanResult = [];
  });

  it('strips sensitive user fields from JSON export', async () => {
    const handler = findHandler('/json');
    const req = { user: { userId: 'user1' }, params: {}, query: {}, body: {} };
    const res = mockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    const payload = typeof res.body === 'string' ? JSON.parse(res.body) : res.body;
    expect(payload.user).toMatchObject({
      _id: 'user1',
      username: 'alice',
      email: 'a@example.com',
    });
    expect(payload.user).not.toHaveProperty('resetCodeHash');
    expect(payload.user).not.toHaveProperty('resetTokenHash');
    expect(payload.user).not.toHaveProperty('pendingEmail');
  });

  it('returns statistics without hitting sensitive fields', async () => {
    const handler = findHandler('/statistics');
    const req = { user: { userId: 'user1' }, params: {}, query: {}, body: {} };
    const res = mockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      entries: 1,
      tasks: 2,
      goals: 3,
      notes: 4,
      habits: 5,
      clusters: 6,
      sections: 7,
      appointments: 9,
      total: 1 + 2 + 3 + 4 + 5 + 6 + 7 + 9,
    });
  });

  it('guards against CSV formula injection', async () => {
    const handler = findHandler('/csv/entries');
    fixtures.defaultFind._leanResult = [
      {
        date: '2024-01-01',
        text: '=2+2',
        mood: 'happy',
        tags: ['a'],
        pinned: false,
        createdAt: new Date('2024-01-01T00:00:00Z'),
      },
    ];
    const req = { user: { userId: 'user1' }, params: {}, query: {}, body: {} };
    const res = mockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(String(res.body)).toContain("\"'=2+2\"");
  });
});
