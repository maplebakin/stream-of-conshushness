import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import express from 'express';

const findMock = vi.fn();

vi.mock('../../middleware/auth.js', () => ({
  default: (req, _res, next) => {
    req.user = { userId: 'user123' };
    next();
  },
}));

vi.mock('../../models/Entry.js', () => ({
  default: {
    find: (...args) => findMock(...args),
  },
}));

const router = (await import('../export.js')).default;

describe('CSV export sanitization', () => {
  let app;

  beforeEach(() => {
    findMock.mockReset();

    findMock.mockReturnValue({
      sort: () => ({
        lean: async () => [{
          date: '2024-01-01',
          text: '=1+1',
          mood: '@mood',
          tags: ['+sum', 'line\nbreak'],
          pinned: false,
          createdAt: '2024-01-02T00:00:00.000Z',
        }],
      }),
    });

    app = express();
    app.use((req, _res, next) => {
      req.user = { userId: 'user123' };
      next();
    });
    app.use('/api/export', router);
  });

  it('sanitizes user-controlled CSV fields', async () => {
    const res = await request(app).get('/api/export/csv/entries');

    expect(res.status).toBe(200);

    const [, row] = res.text.split('\n');

    expect(row).toBe(
      "2024-01-01,\"'" +
        "=1+1\",'@mood,\"'+sum, line break\",No,2024-01-02T00:00:00.000Z",
    );
  });
});
