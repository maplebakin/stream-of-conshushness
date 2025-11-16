import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';

const findMock = vi.fn();
const expandMock = vi.fn();

vi.mock('../../middleware/auth.js', () => ({
  default: (req, _res, next) => {
    req.user = { id: 'user123' };
    next();
  }
}));

vi.mock('../../models/Appointment.js', () => ({
  default: {
    find: (...args) => findMock(...args),
    create: vi.fn(),
  }
}));

vi.mock('../../utils/recurrence.js', () => ({
  expandDatesInRange: (...args) => expandMock(...args),
}));

vi.mock('../../utils/clusterIds.js', () => ({
  normalizeClusterIds: (ids = []) => ids,
  resolveClusterIdForOwner: async () => null,
}));

const router = (await import('../appointments.js')).default;

describe('GET /api/appointments date handling', () => {
  let app;

  beforeEach(() => {
    findMock.mockReset();
    expandMock.mockReset();
    app = express();
    app.use('/api/appointments', router);
  });

  it('returns 400 when only invalid dates are provided', async () => {
    const res = await request(app).get('/api/appointments?from=bad&to=alsobad');

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(findMock).not.toHaveBeenCalled();
  });

  it('bases range and expansion on validated values when some dates are invalid', async () => {
    const capturedQueries = [];
    findMock
      .mockImplementationOnce((query) => {
        capturedQueries.push(query);
        return { sort: () => ({ lean: async () => [] }) };
      })
      .mockImplementationOnce((query) => {
        capturedQueries.push(query);
        return { lean: async () => [{
          _id: 's-invalid',
          title: 'Series',
          startDate: '2024-01-05',
          rrule: 'FREQ=DAILY',
          timeStart: null,
          timeEnd: null,
          time: null,
          location: '',
          details: '',
          cluster: '',
          clusters: [],
          tz: 'America/Toronto',
        }] };
      });

    expandMock.mockReturnValue(['2024-02-01']);

    const res = await request(app).get('/api/appointments?from=not-a-date&to=2024-02-01');

    expect(res.status).toBe(200);
    expect(capturedQueries[0]).toMatchObject({ userId: 'user123', date: { $lte: '2024-02-01' }, rrule: '' });
    expect(capturedQueries[1]).toMatchObject({ userId: 'user123', rrule: { $ne: '' }, startDate: { $lte: '2024-02-01' } });
    expect(capturedQueries[1].$or).toEqual([{ until: null }, { until: { $gte: '2024-02-01' } }, { until: '' }]);
    expect(expandMock).toHaveBeenCalledWith(expect.any(String), expect.any(String), '2024-02-01', '2024-02-01');
  });

  it('uses validated range bounds when both dates are valid', async () => {
    const capturedQueries = [];
    findMock
      .mockImplementationOnce((query) => {
        capturedQueries.push(query);
        return { sort: () => ({ lean: async () => [{ _id: '1', date: '2024-01-10', title: 'One-off' }] }) };
      })
      .mockImplementationOnce((query) => {
        capturedQueries.push(query);
        return { lean: async () => [{
          _id: 's1',
          title: 'Series',
          startDate: '2024-01-05',
          rrule: 'FREQ=DAILY',
          timeStart: null,
          timeEnd: null,
          time: null,
          location: '',
          details: '',
          cluster: '',
          clusters: [],
          tz: 'America/Toronto',
        }] };
      });

    expandMock.mockReturnValue(['2024-01-15']);

    const res = await request(app).get('/api/appointments?from=2024-01-01&to=2024-01-31');

    expect(res.status).toBe(200);
    expect(capturedQueries[0]).toMatchObject({
      userId: 'user123',
      date: { $gte: '2024-01-01', $lte: '2024-01-31' },
      rrule: '',
    });
    expect(capturedQueries[1]).toMatchObject({ userId: 'user123', rrule: { $ne: '' }, startDate: { $lte: '2024-01-31' } });
    expect(capturedQueries[1].$or).toEqual([{ until: null }, { until: { $gte: '2024-01-01' } }, { until: '' }]);
    expect(expandMock).toHaveBeenCalledWith('FREQ=DAILY', '2024-01-05', '2024-01-01', '2024-01-31');
    expect(res.body).toHaveLength(2);
  });
});
