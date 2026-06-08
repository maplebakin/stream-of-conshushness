import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  sectionPageFind: vi.fn(),
}));

vi.mock('../../models/SectionPage.js', () => ({
  default: {
    find: mocks.sectionPageFind,
  },
}));

import sectionPagesRouter from '../sectionPages.js';

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

describe('section pages routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('filters pages by section key on canonical by-section route', async () => {
    const handler = findRoute(sectionPagesRouter, '/by-section/:sectionKey', 'get');
    const lean = vi.fn().mockResolvedValue([
      { _id: 'p1', sectionKey: 'games', title: 'Games Manual' },
    ]);
    const sort = vi.fn(() => ({ lean }));
    mocks.sectionPageFind.mockReturnValue({ sort });

    const req = {
      user: { userId: 'u1' },
      params: { sectionKey: 'games' },
    };
    const res = mockRes();

    await handler(req, res);

    expect(mocks.sectionPageFind).toHaveBeenCalledWith(
      expect.objectContaining({ sectionKey: 'games' })
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      count: 1,
      items: [{ _id: 'p1', sectionKey: 'games', title: 'Games Manual' }],
    });
  });
});
