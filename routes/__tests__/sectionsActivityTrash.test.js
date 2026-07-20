import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  sectionFind: vi.fn(),
  entryAggregate: vi.fn(),
  taskAggregate: vi.fn(),
}));

vi.mock('../../models/Section.js', () => ({
  default: {
    find: mocks.sectionFind,
  },
}));

vi.mock('../../models/Entry.js', () => ({
  default: {
    aggregate: mocks.entryAggregate,
  },
}));

vi.mock('../../models/Task.js', () => ({
  default: {
    aggregate: mocks.taskAggregate,
  },
}));

import sectionsRouter from '../sections.js';

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

describe('section activity excludes trashed entries', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    const sectionsQuery = {
      select: vi.fn(() => ({
        lean: vi.fn().mockResolvedValue([
          { slug: 'journal' },
          { slug: 'archive' },
        ]),
      })),
    };
    mocks.sectionFind.mockReturnValue(sectionsQuery);
    mocks.entryAggregate.mockResolvedValue([
      { _id: 'journal', count: 2 },
      { _id: 'archive', count: 0 },
    ]);
    mocks.taskAggregate.mockResolvedValue([]);
  });

  it('counts only active entries and leaves trashed-only sections inactive', async () => {
    const handler = findRoute(sectionsRouter, '/activity', 'get');
    const req = {
      user: { userId: '507f1f77bcf86cd799439011' },
      query: { window: '7d' },
    };
    const res = mockRes();

    await handler(req, res);

    expect(mocks.entryAggregate).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          $match: expect.objectContaining({
            userId: expect.any(Object),
            deletedAt: null,
          }),
        }),
      ]),
    );
    expect(mocks.taskAggregate).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          $match: expect.objectContaining({ deletedAt: null }),
        }),
      ])
    );

    expect(res.statusCode).toBe(200);
    expect(res.body.activity).toMatchObject({
      journal: { entries: 2, tasks: 0, total: 2 },
      archive: { entries: 0, tasks: 0, total: 0 },
    });
  });
});
