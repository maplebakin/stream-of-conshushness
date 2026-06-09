import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  taskFindOne: vi.fn(),
  taskUpdateMany: vi.fn(),
  taskCreate: vi.fn(),
  taskFindOneAndUpdate: vi.fn(),
  entryFindOne: vi.fn(),
  entryCreate: vi.fn(),
  resolveClusterIdForOwner: vi.fn(),
}));

vi.mock('../../models/Task.js', () => ({
  default: {
    findOne: mocks.taskFindOne,
    updateMany: mocks.taskUpdateMany,
    create: mocks.taskCreate,
    findOneAndUpdate: mocks.taskFindOneAndUpdate,
  },
}));

vi.mock('../../models/Entry.js', () => ({
  default: {
    findOne: mocks.entryFindOne,
    create: mocks.entryCreate,
  },
}));

vi.mock('../../utils/clusterIds.js', () => ({
  normalizeClusterIds: (v) => v,
  resolveClusterIdForOwner: mocks.resolveClusterIdForOwner,
}));

vi.mock('../../services/taskService.js', () => ({
  getTasks: vi.fn().mockResolvedValue([]),
}));

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

describe('tasks flow routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('carry-forward returns 401 without auth user', async () => {
    const handler = findRoute(taskRouter, '/carry-forward', 'post');
    const req = { user: null, body: {}, query: {} };
    const res = mockRes();

    await handler(req, res);

    expect(res.statusCode).toBe(401);
  });

  it('carry-forward validates date shape', async () => {
    const handler = findRoute(taskRouter, '/carry-forward', 'post');
    const req = {
      user: { userId: 'u1' },
      body: { from: 'bad-date', to: '2026-02-21' },
      query: {},
    };
    const res = mockRes();

    await handler(req, res);

    expect(res.statusCode).toBe(400);
    expect(mocks.taskUpdateMany).not.toHaveBeenCalled();
  });

  it('carry-forward updates tasks with canonical match', async () => {
    const handler = findRoute(taskRouter, '/carry-forward', 'post');
    mocks.taskUpdateMany.mockResolvedValue({ modifiedCount: 2 });
    const req = {
      user: { userId: 'u1' },
      body: { from: '2026-02-20', to: '2026-02-21' },
      query: {},
    };
    const res = mockRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(mocks.taskUpdateMany).toHaveBeenCalledWith(
      { userId: 'u1', completed: false, dueDate: '2026-02-20', deletedAt: null },
      { $set: { dueDate: '2026-02-21' } }
    );
    expect(res.body).toMatchObject({ moved: 2 });
  });

  it('from-entry enforces ownership', async () => {
    const handler = findRoute(taskRouter, '/from-entry', 'post');
    mocks.entryFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
    const req = { user: { userId: 'u1' }, body: { entryId: '507f1f77bcf86cd799439011' }, query: {} };
    const res = mockRes();

    await handler(req, res);

    expect(res.statusCode).toBe(404);
    expect(mocks.taskCreate).not.toHaveBeenCalled();
  });

  it('from-entry creates task for owned entry', async () => {
    const handler = findRoute(taskRouter, '/from-entry', 'post');
    mocks.entryFindOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue({ _id: 'e1', date: '2026-02-20', text: 'entry text', clusters: [] }),
    });
    const populate = vi.fn().mockResolvedValue(undefined);
    mocks.taskCreate.mockResolvedValue({ _id: 't1', populate });

    const req = {
      user: { userId: 'u1' },
      body: { entryId: '507f1f77bcf86cd799439011', title: 'From entry' },
      query: {},
    };
    const res = mockRes();

    await handler(req, res);

    expect(res.statusCode).toBe(201);
    expect(mocks.taskCreate).toHaveBeenCalled();
    expect(res.body.ok).toBe(true);
  });

  it('link-entry validates task id and date', async () => {
    const handler = findRoute(taskRouter, '/:id/link-entry', 'post');

    const badTaskReq = { params: { id: 'bad-id' }, user: { userId: 'u1' }, body: { date: '2026-02-20' } };
    const badTaskRes = mockRes();
    await handler(badTaskReq, badTaskRes);
    expect(badTaskRes.statusCode).toBe(400);

    const goodTask = { _id: 't1', save: vi.fn().mockResolvedValue(undefined) };
    mocks.taskFindOne.mockResolvedValue(goodTask);
    const badDateReq = { params: { id: '507f1f77bcf86cd799439011' }, user: { userId: 'u1' }, body: { date: '20-02-2026' } };
    const badDateRes = mockRes();
    await handler(badDateReq, badDateRes);
    expect(badDateRes.statusCode).toBe(400);
  });

  it('link-entry links existing entry by date', async () => {
    const handler = findRoute(taskRouter, '/:id/link-entry', 'post');

    const taskDoc = { _id: '507f1f77bcf86cd799439011', save: vi.fn().mockResolvedValue(undefined) };
    mocks.taskFindOne.mockResolvedValue(taskDoc);

    mocks.entryFindOne
      .mockResolvedValueOnce({ _id: 'e1', date: '2026-02-20' });

    const req = {
      params: { id: '507f1f77bcf86cd799439011' },
      user: { userId: 'u1' },
      body: { date: '2026-02-20', autoCreate: false },
      query: {},
    };
    const res = mockRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(taskDoc.entryId).toBe('e1');
    expect(res.body.ok).toBe(true);
  });

  it('delete soft-deletes a task', async () => {
    const handler = findRoute(taskRouter, '/:id', 'delete');
    mocks.taskFindOneAndUpdate.mockResolvedValue({ _id: '507f1f77bcf86cd799439011' });

    const req = {
      params: { id: '507f1f77bcf86cd799439011' },
      user: { userId: 'u1' }
    };
    const res = mockRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(mocks.taskFindOneAndUpdate).toHaveBeenCalledWith(
      { _id: '507f1f77bcf86cd799439011', userId: 'u1', deletedAt: null },
      { $set: { deletedAt: expect.any(Date) } },
      { new: true }
    );
    expect(res.body).toEqual({ ok: true, deleted: '507f1f77bcf86cd799439011' });
  });

  it('bulk delete soft-deletes multiple tasks', async () => {
    const handler = findRoute(taskRouter, '/bulk/delete', 'post');
    mocks.taskUpdateMany.mockResolvedValue({ modifiedCount: 3 });

    const req = {
      user: { userId: 'u1' },
      body: { ids: ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012'] }
    };
    const res = mockRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(mocks.taskUpdateMany).toHaveBeenCalledWith(
      {
        _id: { $in: expect.any(Array) },
        userId: 'u1',
        deletedAt: null
      },
      { $set: { deletedAt: expect.any(Date) } }
    );
    expect(res.body).toEqual({ ok: true, deleted: 3 });
  });
});
