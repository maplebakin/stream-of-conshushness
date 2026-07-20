import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  taskFind: vi.fn(),
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
    find: mocks.taskFind,
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
  resolveClusterIdsForOwner: async (_userId, ids = []) => ids,
}));

vi.mock('../../services/taskService.js', () => ({
  getTasks: vi.fn().mockResolvedValue([]),
}));

import taskRouter from '../tasks.js';
import { getTasks } from '../../services/taskService.js';

function mockRes() {
  const res = { statusCode: 200, body: null, headers: {} };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (data) => { res.body = data; return res; };
  res.set = (name, value) => { res.headers[name] = value; return res; };
  return res;
}

function findRoute(router, path, method) {
  return router.stack.find(
    (layer) => layer.route && layer.route.path === path && layer.route.methods?.[method]
  )?.route?.stack?.[0]?.handle;
}

function mockRecurringToggle(task) {
  mocks.taskFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(task) });
  mocks.taskFindOneAndUpdate.mockReturnValue({
    populate: vi.fn().mockReturnThis(),
    lean: vi.fn().mockResolvedValue({ ...task, completed: true, status: 'done' }),
  });
  mocks.taskCreate.mockImplementation(async (payload) => ({
    _id: 'next-task',
    ...payload,
    populate: vi.fn().mockResolvedValue(undefined),
  }));
}

async function toggleRecurringTask(handler, id = '507f1f77bcf86cd799439011', body = {}) {
  const req = { params: { id }, user: { userId: 'u1' }, body };
  const res = mockRes();
  await handler(req, res);
  return res;
}

describe('tasks flow routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists tasks through the shared task service', async () => {
    const handler = findRoute(taskRouter, '/', 'get');
    getTasks.mockResolvedValueOnce({ count: 5 });
    const req = {
      user: { userId: 'u1' },
      query: { view: 'inbox', countOnly: '1' },
    };
    const res = mockRes();

    await handler(req, res);

    expect(getTasks).toHaveBeenCalledWith('u1', { view: 'inbox', countOnly: '1' });
    expect(res.body).toEqual({ count: 5 });
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

  it('creates tasks with notes alias and explicit completed state', async () => {
    const handler = findRoute(taskRouter, '/', 'post');
    const populate = vi.fn().mockResolvedValue(undefined);
    mocks.taskCreate.mockResolvedValue({ _id: 't-completed', populate });
    const req = {
      user: { userId: 'u1' },
      body: {
        title: 'Restore this task',
        note: 'Restored note',
        completed: true,
        status: 'todo',
      },
    };
    const res = mockRes();

    await handler(req, res);

    expect(res.statusCode).toBe(201);
    expect(mocks.taskCreate).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Restore this task',
      notes: 'Restored note',
      completed: true,
      status: 'done',
    }));
  });

  it('replays a manual task create with the same idempotency key', async () => {
    const handler = findRoute(taskRouter, '/', 'post');
    const task = {
      _id: 'task-once',
      userId: 'u1',
      title: 'Only once',
      deletedAt: null,
      populate: vi.fn().mockResolvedValue(undefined),
    };
    mocks.taskFindOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(task);
    mocks.taskCreate.mockResolvedValue(task);
    const request = () => ({
      user: { userId: 'u1' },
      body: { title: 'Only once' },
      get: (name) => name === 'Idempotency-Key' ? 'task:manual-retry-1234' : undefined,
    });
    const first = mockRes();
    const retry = mockRes();

    await handler(request(), first);
    await handler(request(), retry);

    expect(first.statusCode).toBe(201);
    expect(retry.statusCode).toBe(200);
    expect(retry.headers['Idempotency-Replayed']).toBe('true');
    expect(mocks.taskCreate).toHaveBeenCalledTimes(1);
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

  it('generic PATCH completion creates the same provenance-preserving recurring successor', async () => {
    const handler = findRoute(taskRouter, '/:id', 'patch');
    const task = {
      _id: '507f1f77bcf86cd799439011',
      userId: 'u1',
      completed: false,
      completedAt: null,
      status: 'todo',
      title: 'Context-linked daily task',
      notes: 'Keep this detail',
      dueDate: '2026-07-13',
      priority: 2,
      clusters: ['cluster-1'],
      sections: ['Work'],
      rrule: 'FREQ=DAILY;COUNT=2',
      entryId: 'entry-1',
      goalId: 'goal-1',
      populate: vi.fn().mockResolvedValue(undefined),
    };
    task.save = vi.fn(async () => {
      task.completedAt = task.completed ? new Date() : null;
      return task;
    });
    mocks.taskFindOne.mockResolvedValue(task);
    mocks.taskFindOneAndUpdate.mockReturnValue({
      populate: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue({
        ...task,
        completed: true,
        completedAt: new Date('2026-07-13T13:00:00Z'),
        status: 'done',
      }),
    });
    mocks.taskCreate.mockImplementation(async (payload) => ({
      _id: 'patch-successor',
      ...payload,
      populate: vi.fn().mockResolvedValue(undefined),
    }));
    const req = {
      params: { id: task._id },
      user: { userId: 'u1' },
      body: { completed: true },
    };
    const res = mockRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(mocks.taskFindOne).toHaveBeenCalledWith({
      _id: task._id,
      userId: 'u1',
      deletedAt: null,
    });
    expect(task).toMatchObject({ completed: true, status: 'done' });
    expect(mocks.taskCreate).toHaveBeenCalledWith(expect.objectContaining({
      recurrenceSourceTaskId: task._id,
      dueDate: '2026-07-14',
      rrule: 'FREQ=DAILY;COUNT=1',
      entryId: 'entry-1',
      goalId: 'goal-1',
      userId: 'u1',
    }));
  });

  it('generic PATCH retries repair a missing successor without re-completing the source', async () => {
    const handler = findRoute(taskRouter, '/:id', 'patch');
    const task = {
      _id: '507f1f77bcf86cd799439011',
      completed: true,
      completedAt: new Date('2026-07-13T12:00:00Z'),
      status: 'done',
      title: 'Retry-safe task',
      notes: '',
      dueDate: '2026-07-13',
      priority: 0,
      clusters: [],
      sections: [],
      rrule: 'FREQ=DAILY',
      save: vi.fn(),
      populate: vi.fn().mockResolvedValue(undefined),
    };
    task.save.mockResolvedValue(task);
    mocks.taskFindOne.mockResolvedValue(task);
    mocks.taskCreate.mockImplementation(async (payload) => ({
      _id: 'repaired-successor',
      ...payload,
      populate: vi.fn().mockResolvedValue(undefined),
    }));
    const req = {
      params: { id: task._id },
      user: { userId: 'u1' },
      body: { status: 'done' },
    };
    const res = mockRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(task.save).not.toHaveBeenCalled();
    expect(mocks.taskCreate).toHaveBeenCalledTimes(1);
    expect(mocks.taskCreate).toHaveBeenCalledWith(expect.objectContaining({
      recurrenceSourceTaskId: task._id,
      dueDate: '2026-07-14',
    }));
  });

  it('generic PATCH uncompletion normalizes status without creating another successor', async () => {
    const handler = findRoute(taskRouter, '/:id', 'patch');
    const task = {
      _id: '507f1f77bcf86cd799439011',
      completed: true,
      completedAt: new Date('2026-07-13T12:00:00Z'),
      status: 'done',
      title: 'Reopened task',
      dueDate: '2026-07-13',
      rrule: 'FREQ=DAILY',
      populate: vi.fn().mockResolvedValue(undefined),
    };
    task.save = vi.fn(async () => {
      task.completedAt = task.completed ? task.completedAt : null;
      return task;
    });
    mocks.taskFindOne.mockResolvedValue(task);
    mocks.taskFindOneAndUpdate.mockReturnValue({
      populate: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue({
        ...task,
        completed: false,
        completedAt: null,
        status: 'todo',
      }),
    });
    const req = {
      params: { id: task._id },
      user: { userId: 'u1' },
      body: { completed: false },
    };
    const res = mockRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(task).toMatchObject({ completed: false, completedAt: null, status: 'todo' });
    expect(mocks.taskCreate).not.toHaveBeenCalled();
  });

  it('generic PATCH rejects ambiguous completion values', async () => {
    const handler = findRoute(taskRouter, '/:id', 'patch');
    const req = {
      params: { id: '507f1f77bcf86cd799439011' },
      user: { userId: 'u1' },
      body: { completed: 'true' },
    };
    const res = mockRes();

    await handler(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'completed must be a boolean' });
    expect(mocks.taskFindOne).not.toHaveBeenCalled();
  });

  it('creates a non-drifting monthly successor when a recurring task is completed', async () => {
    const handler = findRoute(taskRouter, '/:id/toggle', 'patch');
    const task = {
      _id: '507f1f77bcf86cd799439011',
      completed: false,
      status: 'todo',
      title: 'Month end review',
      notes: 'Keep the existing task details',
      dueDate: '2026-01-31',
      priority: 2,
      clusters: ['cluster-1'],
      sections: ['Work'],
      rrule: 'FREQ=MONTHLY',
      entryId: 'entry-1',
      goalId: 'goal-1',
    };
    mockRecurringToggle(task);
    const res = await toggleRecurringTask(handler);

    expect(mocks.taskCreate).toHaveBeenCalledWith(expect.objectContaining({
      dueDate: '2026-03-31',
      rrule: 'FREQ=MONTHLY',
      title: 'Month end review',
      notes: 'Keep the existing task details',
      userId: 'u1',
      priority: 2,
      clusters: ['cluster-1'],
      sections: ['Work'],
      entryId: 'entry-1',
      goalId: 'goal-1',
      completed: false,
      status: 'todo',
    }));
    const successor = mocks.taskCreate.mock.calls[0][0];
    expect(successor).not.toHaveProperty('completedAt');
    expect(successor).not.toHaveProperty('deletedAt');
    expect(mocks.taskFindOne.mock.calls[0][1]).toContain('entryId');
    expect(mocks.taskFindOne.mock.calls[0][1]).toContain('goalId');
    expect(res.body.task).toMatchObject({ completed: true, status: 'done' });
    expect(res.body.next).toMatchObject({ _id: 'next-task' });
  });

  it('keeps weekly interval cadence when rolling a recurring task forward', async () => {
    const handler = findRoute(taskRouter, '/:id/toggle', 'patch');
    const task = {
      _id: '507f1f77bcf86cd799439011',
      completed: false,
      status: 'todo',
      title: 'Biweekly review',
      notes: '',
      dueDate: '2025-12-29',
      priority: 1,
      clusters: [],
      sections: [],
      rrule: 'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO',
    };
    mockRecurringToggle(task);

    await toggleRecurringTask(handler);

    expect(mocks.taskCreate).toHaveBeenCalledWith(expect.objectContaining({
      dueDate: '2026-01-12',
    }));
  });

  it('does not create a recurring successor after UNTIL', async () => {
    const handler = findRoute(taskRouter, '/:id/toggle', 'patch');
    const task = {
      _id: '507f1f77bcf86cd799439011',
      completed: false,
      status: 'todo',
      title: 'Ending daily task',
      notes: '',
      dueDate: '2026-06-08',
      priority: 1,
      clusters: [],
      sections: [],
      rrule: 'FREQ=DAILY;UNTIL=2026-06-08',
    };
    mockRecurringToggle(task);

    const res = await toggleRecurringTask(handler);

    expect(mocks.taskCreate).not.toHaveBeenCalled();
    expect(res.body.next).toBeNull();
  });

  it('uses a desired completion state to heal a missing successor without flipping the source back', async () => {
    const handler = findRoute(taskRouter, '/:id/toggle', 'patch');
    const task = {
      _id: '507f1f77bcf86cd799439011',
      completed: true,
      status: 'done',
      title: 'Retry-safe daily task',
      notes: '',
      dueDate: '2026-06-08',
      priority: 1,
      clusters: [],
      sections: [],
      rrule: 'FREQ=DAILY',
    };
    mocks.taskFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(task) });
    mocks.taskCreate.mockImplementation(async (payload) => ({
      _id: 'healed-successor',
      ...payload,
      populate: vi.fn().mockResolvedValue(undefined),
    }));

    const res = await toggleRecurringTask(handler, task._id, { completed: true });

    expect(res.statusCode).toBe(200);
    expect(mocks.taskFindOneAndUpdate).not.toHaveBeenCalled();
    expect(mocks.taskCreate).toHaveBeenCalledWith(expect.objectContaining({
      recurrenceSourceTaskId: task._id,
      dueDate: '2026-06-09',
    }));
    expect(res.body.task).toMatchObject({ completed: true, status: 'done' });
    expect(res.body.next).toMatchObject({ _id: 'healed-successor' });
  });

  it('treats a concurrent desired-complete winner as success and repairs its successor', async () => {
    const handler = findRoute(taskRouter, '/:id/toggle', 'patch');
    const task = {
      _id: '507f1f77bcf86cd799439011',
      completed: false,
      status: 'todo',
      title: 'Concurrent daily task',
      notes: '',
      dueDate: '2026-06-08',
      priority: 1,
      clusters: [],
      sections: [],
      rrule: 'FREQ=DAILY',
    };
    mocks.taskFindOne
      .mockReturnValueOnce({ lean: vi.fn().mockResolvedValue(task) })
      .mockReturnValueOnce({
        lean: vi.fn().mockResolvedValue({ ...task, completed: true, status: 'done' }),
      });
    mocks.taskFindOneAndUpdate.mockReturnValue({
      populate: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue(null),
    });
    mocks.taskCreate.mockImplementation(async (payload) => ({
      _id: 'concurrent-successor',
      ...payload,
      populate: vi.fn().mockResolvedValue(undefined),
    }));

    const res = await toggleRecurringTask(handler, task._id, { completed: true });

    expect(res.statusCode).toBe(200);
    expect(mocks.taskCreate).toHaveBeenCalledTimes(1);
    expect(res.body.task).toMatchObject({ completed: true, status: 'done' });
    expect(res.body.next).toMatchObject({ _id: 'concurrent-successor' });
  });

  it('rejects a non-boolean desired completion state', async () => {
    const handler = findRoute(taskRouter, '/:id/toggle', 'patch');

    const res = await toggleRecurringTask(
      handler,
      '507f1f77bcf86cd799439011',
      { completed: 'true' }
    );

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'completed must be a boolean' });
    expect(mocks.taskFindOne).not.toHaveBeenCalled();
  });

  it('returns the existing successor on a repeated desired-complete request', async () => {
    const handler = findRoute(taskRouter, '/:id/toggle', 'patch');
    const task = {
      _id: '507f1f77bcf86cd799439011',
      completed: true,
      status: 'done',
      title: 'Daily retry-safe task',
      dueDate: '2026-06-08',
      clusters: [],
      sections: [],
      rrule: 'FREQ=DAILY',
    };
    const existing = {
      _id: '507f1f77bcf86cd799439099',
      dueDate: '2026-06-09',
      populate: vi.fn().mockResolvedValue(undefined),
    };
    mocks.taskFindOne
      .mockReturnValueOnce({ lean: vi.fn().mockResolvedValue(task) })
      .mockResolvedValueOnce(existing);
    mocks.taskCreate.mockRejectedValue(Object.assign(new Error('duplicate'), { code: 11000 }));

    const res = await toggleRecurringTask(handler, task._id, { completed: true });

    expect(res.statusCode).toBe(200);
    expect(mocks.taskFindOneAndUpdate).not.toHaveBeenCalled();
    expect(mocks.taskFindOne).toHaveBeenLastCalledWith({
      userId: 'u1',
      recurrenceSourceTaskId: task._id,
    });
    expect(res.body.next).toBe(existing);
  });

  it('revives a soft-deleted recurring successor on a completion retry', async () => {
    const handler = findRoute(taskRouter, '/:id/toggle', 'patch');
    const source = {
      _id: '507f1f77bcf86cd799439011',
      completed: true,
      status: 'done',
      title: 'Daily context check',
      notes: '',
      dueDate: '2026-07-13',
      priority: 0,
      clusters: [],
      sections: [],
      rrule: 'FREQ=DAILY',
    };
    const deletedSuccessor = {
      _id: 'deleted-successor',
      userId: 'u1',
      recurrenceSourceTaskId: source._id,
      deletedAt: new Date('2026-07-13T12:00:00Z'),
    };
    const recovered = {
      ...deletedSuccessor,
      deletedAt: null,
      dueDate: '2026-07-14',
      populate: vi.fn().mockResolvedValue(undefined),
    };
    mocks.taskFindOne.mockImplementation((query) => (
      query.recurrenceSourceTaskId
        ? Promise.resolve(deletedSuccessor)
        : { lean: vi.fn().mockResolvedValue(source) }
    ));
    mocks.taskCreate.mockRejectedValue(Object.assign(new Error('duplicate successor'), { code: 11000 }));
    mocks.taskFindOneAndUpdate.mockResolvedValue(recovered);

    const res = await toggleRecurringTask(handler, source._id, { completed: true });

    expect(res.statusCode).toBe(200);
    expect(mocks.taskFindOneAndUpdate).toHaveBeenCalledWith(
      { _id: deletedSuccessor._id, userId: 'u1', deletedAt: { $ne: null } },
      { $set: expect.objectContaining({ dueDate: '2026-07-14', deletedAt: null }) },
      { new: true, runValidators: true }
    );
    expect(res.body.next).toMatchObject({ _id: 'deleted-successor', deletedAt: null });
  });

  it.each([
    ['entryId without goalId', { entryId: 'entry-only' }, { entryId: 'entry-only' }, 'goalId'],
    ['goalId without entryId', { goalId: 'goal-only' }, { goalId: 'goal-only' }, 'entryId'],
    ['neither relationship', {}, {}, 'entryId'],
  ])('creates a valid successor when the source has %s', async (_label, relationships, expected, absent) => {
    const handler = findRoute(taskRouter, '/:id/toggle', 'patch');
    const task = {
      _id: '507f1f77bcf86cd799439011',
      completed: false,
      status: 'todo',
      title: 'Recurring task',
      notes: '',
      dueDate: '2026-06-08',
      priority: 1,
      clusters: ['cluster-1'],
      sections: ['Personal'],
      rrule: 'FREQ=DAILY',
      ...relationships,
    };
    mockRecurringToggle(task);

    const res = await toggleRecurringTask(handler);
    const successor = mocks.taskCreate.mock.calls[0][0];

    expect(res.statusCode).toBe(200);
    expect(successor).toMatchObject({
      dueDate: '2026-06-09',
      rrule: 'FREQ=DAILY',
      clusters: ['cluster-1'],
      sections: ['Personal'],
      ...expected,
    });
    expect(successor).not.toHaveProperty(absent);
    if (_label === 'neither relationship') expect(successor).not.toHaveProperty('goalId');
  });

  it('preserves entry and goal provenance across multiple recurring successors', async () => {
    const handler = findRoute(taskRouter, '/:id/toggle', 'patch');
    const original = {
      _id: '507f1f77bcf86cd799439011',
      completed: false,
      status: 'todo',
      title: 'Daily source-linked task',
      notes: 'Keep context',
      dueDate: '2026-06-08',
      priority: 3,
      clusters: ['cluster-1'],
      sections: ['Work'],
      rrule: 'FREQ=DAILY',
      entryId: 'entry-1',
      goalId: 'goal-1',
    };
    const created = [];
    const updatedChain = (task) => ({
      populate: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue({ ...task, completed: true, status: 'done' }),
    });

    mocks.taskFindOne
      .mockReturnValueOnce({ lean: vi.fn().mockResolvedValue(original) })
      .mockReturnValueOnce({
        lean: vi.fn().mockImplementation(() => Promise.resolve({
          ...created[0],
          _id: 'successor-1',
          completed: false,
          status: 'todo',
        })),
      });
    mocks.taskFindOneAndUpdate
      .mockReturnValueOnce(updatedChain(original))
      .mockReturnValueOnce(updatedChain({ ...original, _id: 'successor-1', dueDate: '2026-06-09' }));
    mocks.taskCreate.mockImplementation(async (payload) => {
      created.push(payload);
      return { _id: `successor-${created.length}`, ...payload, populate: vi.fn().mockResolvedValue(undefined) };
    });

    await toggleRecurringTask(handler, original._id);
    const secondRes = await toggleRecurringTask(handler, '507f1f77bcf86cd799439012');

    expect(created).toHaveLength(2);
    expect(created[0]).toMatchObject({ entryId: 'entry-1', goalId: 'goal-1', dueDate: '2026-06-09' });
    expect(created[1]).toMatchObject({ entryId: 'entry-1', goalId: 'goal-1', dueDate: '2026-06-10' });
    expect(secondRes.body.task).toMatchObject({ completed: true, status: 'done' });
  });

  it('decrements RRULE COUNT across successors and stops after the final occurrence', async () => {
    const handler = findRoute(taskRouter, '/:id/toggle', 'patch');
    const tasksToComplete = [{
      _id: '507f1f77bcf86cd799439011',
      completed: false,
      status: 'todo',
      title: 'Three-day finite task',
      notes: '',
      dueDate: '2026-06-08',
      priority: 1,
      clusters: [],
      sections: [],
      rrule: 'FREQ=DAILY;COUNT=3',
    }];
    const created = [];

    mocks.taskFindOne.mockImplementation(() => ({
      lean: vi.fn().mockImplementation(async () => tasksToComplete.shift()),
    }));
    mocks.taskFindOneAndUpdate.mockImplementation(() => ({
      populate: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue({ completed: true, status: 'done' }),
    }));
    mocks.taskCreate.mockImplementation(async (payload) => {
      const task = {
        _id: `507f1f77bcf86cd79943901${created.length + 2}`,
        ...payload,
        populate: vi.fn().mockResolvedValue(undefined),
      };
      created.push(task);
      tasksToComplete.push({ ...task, completed: false, status: 'todo' });
      return task;
    });

    await toggleRecurringTask(handler, '507f1f77bcf86cd799439011', { completed: true });
    await toggleRecurringTask(handler, '507f1f77bcf86cd799439012', { completed: true });
    await toggleRecurringTask(handler, '507f1f77bcf86cd799439013', { completed: true });

    expect(created).toHaveLength(2);
    expect(created[0]).toMatchObject({ dueDate: '2026-06-09', rrule: 'FREQ=DAILY;COUNT=2' });
    expect(created[1]).toMatchObject({ dueDate: '2026-06-10', rrule: 'FREQ=DAILY;COUNT=1' });
  });

  it('bulk-completes only active incomplete owned tasks and preserves recurring successors', async () => {
    const handler = findRoute(taskRouter, '/bulk/complete', 'post');
    const recurring = {
      _id: '507f1f77bcf86cd799439011',
      completed: false,
      status: 'todo',
      title: 'Weekly review',
      notes: 'Keep context',
      dueDate: '2026-07-13',
      priority: 2,
      clusters: ['cluster-1'],
      sections: ['Work'],
      rrule: 'FREQ=WEEKLY;COUNT=2',
      entryId: 'entry-1',
      goalId: 'goal-1',
    };
    const manual = {
      _id: '507f1f77bcf86cd799439012',
      completed: false,
      status: 'todo',
      title: 'One-off task',
      dueDate: '2026-07-13',
      clusters: [],
      sections: [],
      rrule: '',
    };
    mocks.taskFind.mockReturnValue({ lean: vi.fn().mockResolvedValue([recurring, manual]) });
    mocks.taskFindOneAndUpdate.mockImplementation((_query, update) => ({
      populate: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue({
        completed: update.$set.completed,
        status: update.$set.status,
      }),
    }));
    mocks.taskCreate.mockImplementation(async (payload) => ({
      _id: 'bulk-successor',
      ...payload,
      populate: vi.fn().mockResolvedValue(undefined),
    }));
    const req = {
      user: { userId: 'u1' },
      body: { ids: [recurring._id, manual._id, '507f1f77bcf86cd799439099'] },
    };
    const res = mockRes();

    await handler(req, res);

    expect(mocks.taskFind).toHaveBeenCalledWith(
      {
        _id: { $in: expect.any(Array) },
        userId: 'u1',
        deletedAt: null,
      },
      expect.stringContaining('rrule')
    );
    expect(mocks.taskFindOneAndUpdate).toHaveBeenCalledTimes(2);
    expect(mocks.taskFindOneAndUpdate).toHaveBeenCalledWith(
      { _id: recurring._id, userId: 'u1', deletedAt: null, completed: false, status: 'todo' },
      { $set: { completed: true, status: 'done', completedAt: expect.any(Date) } },
      { new: true, runValidators: true }
    );
    expect(mocks.taskCreate).toHaveBeenCalledTimes(1);
    expect(mocks.taskCreate).toHaveBeenCalledWith(expect.objectContaining({
      recurrenceSourceTaskId: recurring._id,
      dueDate: '2026-07-20',
      rrule: 'FREQ=WEEKLY;COUNT=1',
      entryId: 'entry-1',
      goalId: 'goal-1',
    }));
    expect(res.body).toEqual({ ok: true, modified: 2, successors: 1 });
  });

  it('bulk completion retries repair successors for already-completed recurring tasks', async () => {
    const handler = findRoute(taskRouter, '/bulk/complete', 'post');
    const recurring = {
      _id: '507f1f77bcf86cd799439011',
      completed: true,
      status: 'done',
      title: 'Already completed weekly review',
      notes: '',
      dueDate: '2026-07-13',
      priority: 1,
      clusters: [],
      sections: [],
      rrule: 'FREQ=WEEKLY',
      entryId: 'entry-1',
      goalId: 'goal-1',
    };
    mocks.taskFind.mockReturnValue({ lean: vi.fn().mockResolvedValue([recurring]) });
    mocks.taskCreate.mockImplementation(async (payload) => ({
      _id: 'repaired-bulk-successor',
      ...payload,
      populate: vi.fn().mockResolvedValue(undefined),
    }));
    const req = {
      user: { userId: 'u1' },
      body: { ids: [recurring._id, recurring._id] },
    };
    const res = mockRes();

    await handler(req, res);

    expect(mocks.taskFindOneAndUpdate).not.toHaveBeenCalled();
    expect(mocks.taskCreate).toHaveBeenCalledTimes(1);
    expect(mocks.taskCreate).toHaveBeenCalledWith(expect.objectContaining({
      recurrenceSourceTaskId: recurring._id,
      entryId: 'entry-1',
      goalId: 'goal-1',
      dueDate: '2026-07-20',
    }));
    expect(res.body).toEqual({ ok: true, modified: 0, successors: 1 });
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
