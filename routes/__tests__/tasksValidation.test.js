import { describe, it, expect, vi, beforeEach } from 'vitest';

const taskMocks = vi.hoisted(() => ({
  mockFindOneAndUpdate: vi.fn(),
  mockUpdateMany: vi.fn(),
  mockFindOneAndDelete: vi.fn(),
  mockFindOne: vi.fn(),
  mockCreate: vi.fn(),
}));

vi.mock('../../models/Task.js', () => ({
  default: {
    findOneAndUpdate: taskMocks.mockFindOneAndUpdate,
    updateMany: taskMocks.mockUpdateMany,
    findOneAndDelete: taskMocks.mockFindOneAndDelete,
    findOne: taskMocks.mockFindOne,
    create: taskMocks.mockCreate,
  },
}));

const { mockFindOneAndUpdate, mockUpdateMany, mockFindOne, mockCreate } = taskMocks;

import taskRouter from '../tasks.js';

function mockRes() {
  const res = { statusCode: 200, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (data) => { res.body = data; return res; };
  return res;
}

function findRoute(router, path, method) {
  return router.stack.find(
    (layer) => layer.route && layer.route.path === path && layer.route.methods?.[method]
  )?.route?.stack?.[0]?.handle;
}

describe('tasks router id validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 for invalid id on delete without touching DB', async () => {
    const handler = findRoute(taskRouter, '/:id', 'delete');
    const req = { params: { id: 'not-an-id' }, user: { userId: 'u1' }, body: {}, query: {} };
    const res = mockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(400);
    expect(mockFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid ids in bulk delete and skips DB call', async () => {
    const handler = findRoute(taskRouter, '/bulk-delete', 'post');
    const req = { body: { ids: ['bad-id'] }, user: { userId: 'u1' }, params: {}, query: {} };
    const res = mockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(400);
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  it('rejects unsupported recurrence on create before writing', async () => {
    const handler = findRoute(taskRouter, '/', 'post');
    const req = {
      body: { title: 'Annual task', dueDate: '2026-07-19', rrule: 'FREQ=YEARLY' },
      user: { userId: 'u1' },
      params: {},
      query: {},
    };
    const res = mockRes();

    await handler(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain('frequency');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('validates recurrence against the effective due date on update', async () => {
    const handler = findRoute(taskRouter, '/:id', 'patch');
    const doc = {
      dueDate: '2026-07-19',
      rrule: '',
      save: vi.fn(),
    };
    mockFindOne.mockResolvedValue(doc);
    const req = {
      body: { rrule: 'FREQ=DAILY;UNTIL=2026-07-18' },
      user: { userId: 'u1' },
      params: { id: '507f1f77bcf86cd799439011' },
      query: {},
    };
    const res = mockRes();

    await handler(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain('until');
    expect(doc.save).not.toHaveBeenCalled();
  });
});
