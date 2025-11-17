import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';

const appointmentFindMock = vi.fn();
const importantEventFindMock = vi.fn();

vi.mock('../../middleware/auth.js', () => ({
  default: (req, _res, next) => {
    req.user = { userId: 'user123' };
    next();
  },
}));

vi.mock('../../models/Appointment.js', () => ({
  default: {
    find: (...args) => appointmentFindMock(...args),
  },
}));

vi.mock('../../models/ImportantEvent.js', () => ({
  default: {
    find: (...args) => importantEventFindMock(...args),
  },
}));

const router = (await import('../calendar.js')).default;

describe('GET /api/calendar/upcoming/list', () => {
  let app;

  beforeEach(() => {
    appointmentFindMock.mockReset();
    importantEventFindMock.mockReset();
    app = express();
    app.use('/api/calendar', router);
  });

  it('returns data for a valid from date', async () => {
    appointmentFindMock.mockReturnValue({
      sort: () => ([{ _id: 'a1', title: 'Appt', date: '2024-01-10' }]),
    });
    importantEventFindMock.mockReturnValue({
      sort: () => ([{ _id: 'e1', title: 'Event', date: '2024-02-15' }]),
    });

    const res = await request(app).get('/api/calendar/upcoming/list?from=2024-01-01');

    expect(res.status).toBe(200);
    expect(appointmentFindMock).toHaveBeenCalledWith({
      userId: 'user123',
      date: { $gte: '2024-01-01', $lte: '2024-03-01' },
    });
    expect(importantEventFindMock).toHaveBeenCalledWith({
      userId: 'user123',
      date: { $gte: '2024-01-01', $lte: '2024-03-01' },
    });
    expect(res.body.today).toBe('2024-01-01');
    expect(res.body.appointments[0]).toMatchObject({
      id: 'a1', title: 'Appt', date: '2024-01-10', daysUntil: 9,
    });
    expect(res.body.events[0]).toMatchObject({
      id: 'e1', title: 'Event', date: '2024-02-15', daysUntil: 45,
    });
  });

  it('returns 400 when from is missing', async () => {
    const res = await request(app).get('/api/calendar/upcoming/list');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'from must be YYYY-MM-DD' });
    expect(appointmentFindMock).not.toHaveBeenCalled();
    expect(importantEventFindMock).not.toHaveBeenCalled();
  });

  it('returns 400 when from is malformed', async () => {
    const res = await request(app).get('/api/calendar/upcoming/list?from=2024-13-01');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'from must be a valid date' });
    expect(appointmentFindMock).not.toHaveBeenCalled();
    expect(importantEventFindMock).not.toHaveBeenCalled();
  });
});
