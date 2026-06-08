import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import express from 'express';

const findOneMock = vi.fn();
const createMock = vi.fn();
const findOneAndUpdateMock = vi.fn();

vi.mock('../../models/ImportantEvent.js', () => ({
  default: {
    findOne: (...args) => findOneMock(...args),
    create: (...args) => createMock(...args),
    findOneAndUpdate: (...args) => findOneAndUpdateMock(...args),
    find: vi.fn(),
    findOneAndDelete: vi.fn(),
  },
}));

const router = (await import('../events.js')).default;

describe('important event routes', () => {
  let app;

  beforeEach(() => {
    vi.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.user = { userId: 'user123' };
      next();
    });
    app.use('/api/important-events', router);
  });

  it('preserves source entry links on create and update when entryId is valid', async () => {
    findOneMock.mockResolvedValue(null);
    createMock.mockImplementation(async (doc) => ({ _id: 'event-created', ...doc }));
    findOneAndUpdateMock.mockReturnValue({
      lean: vi.fn(async () => ({
        _id: 'event-created',
        entryId: '507f1f77bcf86cd799439011',
      })),
    });

    const createRes = await request(app)
      .post('/api/important-events')
      .send({
        title: 'Rent due',
        date: '2024-04-01',
        entryId: '507f1f77bcf86cd799439011',
      });

    expect(createRes.status).toBe(201);
    expect(createMock).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user123',
      title: 'Rent due',
      date: '2024-04-01',
      entryId: '507f1f77bcf86cd799439011',
    }));

    const updateRes = await request(app)
      .patch('/api/important-events/event-created')
      .send({ entryId: '507f1f77bcf86cd799439011' });

    expect(updateRes.status).toBe(200);
    expect(findOneAndUpdateMock).toHaveBeenCalledWith(
      { _id: 'event-created', userId: 'user123' },
      {
        $set: { entryId: '507f1f77bcf86cd799439011' },
        $currentDate: { updatedAt: true },
      },
      { new: true }
    );
  });
});
