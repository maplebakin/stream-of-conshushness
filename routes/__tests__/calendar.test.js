import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';

const taskFind = vi.fn();
const appointmentFind = vi.fn();
const eventFind = vi.fn();

vi.mock('../../middleware/auth.js', () => ({
  default: (req, _res, next) => {
    req.user = { userId: 'user123' };
    next();
  },
}));

vi.mock('../../models/Task.js', () => ({
  default: {
    find: (...args) => taskFind(...args),
  },
}));

vi.mock('../../models/Appointment.js', () => ({
  default: {
    find: (...args) => appointmentFind(...args),
  },
}));

vi.mock('../../models/ImportantEvent.js', () => ({
  default: {
    find: (...args) => eventFind(...args),
  },
}));

const router = (await import('../calendar.js')).default;

describe('GET /api/calendar/:ym month boundaries', () => {
  let app;
  let queries;

  beforeEach(() => {
    taskFind.mockReset();
    appointmentFind.mockReset();
    eventFind.mockReset();
    queries = { task: null, appointment: null, event: null };
    app = express();
    app.use('/api/calendar', router);
  });

  it('uses the actual last day for 30-day months', async () => {
    taskFind.mockImplementation(async (query) => {
      queries.task = query;
      return [{ dueDate: '2024-04-15' }];
    });
    appointmentFind.mockImplementation(async (query) => {
      queries.appointment = query;
      return [{ date: '2024-04-20' }];
    });
    eventFind.mockImplementation(async (query) => {
      queries.event = query;
      return [{ date: '2024-04-05' }];
    });

    const res = await request(app).get('/api/calendar/2024-04');

    expect(queries.task).toEqual({ userId: 'user123', dueDate: { $gte: '2024-04-01', $lte: '2024-04-30' } });
    expect(queries.appointment).toEqual({ userId: 'user123', date: { $gte: '2024-04-01', $lte: '2024-04-30' } });
    expect(queries.event).toEqual({ userId: 'user123', date: { $gte: '2024-04-01', $lte: '2024-04-30' } });
    expect(res.body.days).toEqual({
      '2024-04-05': { tasks: 0, appointments: 0, events: 1 },
      '2024-04-15': { tasks: 1, appointments: 0, events: 0 },
      '2024-04-20': { tasks: 0, appointments: 1, events: 0 },
    });
  });

  it('caps February at its actual end date', async () => {
    taskFind.mockImplementation(async (query) => {
      queries.task = query;
      return [{ dueDate: '2023-02-10' }];
    });
    appointmentFind.mockImplementation(async (query) => {
      queries.appointment = query;
      return [{ date: '2023-02-28' }];
    });
    eventFind.mockImplementation(async (query) => {
      queries.event = query;
      return [{ date: '2023-02-14' }];
    });

    const res = await request(app).get('/api/calendar/2023-02');

    expect(queries.task).toEqual({ userId: 'user123', dueDate: { $gte: '2023-02-01', $lte: '2023-02-28' } });
    expect(queries.appointment).toEqual({ userId: 'user123', date: { $gte: '2023-02-01', $lte: '2023-02-28' } });
    expect(queries.event).toEqual({ userId: 'user123', date: { $gte: '2023-02-01', $lte: '2023-02-28' } });
    expect(res.body.days).toEqual({
      '2023-02-10': { tasks: 1, appointments: 0, events: 0 },
      '2023-02-14': { tasks: 0, appointments: 0, events: 1 },
      '2023-02-28': { tasks: 0, appointments: 1, events: 0 },
    });
  });
});
