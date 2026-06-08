import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';

const findMock = vi.fn();
const findOneMock = vi.fn();
const findOneAndDeleteMock = vi.fn();
const expandMock = vi.fn();
const createMock = vi.fn();

vi.mock('../../middleware/auth.js', () => ({
  default: (req, _res, next) => {
    req.user = { id: 'user123' };
    next();
  }
}));

vi.mock('../../models/Appointment.js', () => ({
  default: {
    find: (...args) => findMock(...args),
    findOne: (...args) => findOneMock(...args),
    findOneAndDelete: (...args) => findOneAndDeleteMock(...args),
    create: (...args) => createMock(...args),
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
    vi.clearAllMocks();
    app = express();
    app.use(express.json());
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

  it('preserves source entry links on create when entryId is valid', async () => {
    createMock.mockImplementation(async (doc) => ({ _id: 'appointment-created', ...doc }));

    const res = await request(app)
      .post('/api/appointments')
      .send({
        title: 'Doctor appointment',
        date: '2024-04-05',
        timeStart: '15:00',
        entryId: '507f1f77bcf86cd799439011',
      });

    expect(res.status).toBe(201);
    expect(createMock).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user123',
      title: 'Doctor appointment',
      date: '2024-04-05',
      timeStart: '15:00',
      entryId: '507f1f77bcf86cd799439011',
    }));
  });

  it('updates an owned one-off appointment', async () => {
    const doc = {
      _id: '507f1f77bcf86cd799439011',
      userId: 'user123',
      title: 'Dentist',
      date: '2024-04-05',
      rrule: '',
      save: vi.fn().mockResolvedValue(undefined),
    };
    findOneMock.mockResolvedValue(doc);

    const res = await request(app)
      .patch('/api/appointments/507f1f77bcf86cd799439011')
      .send({ title: 'Updated dentist', date: '2024-04-06', timeStart: '10:30' });

    expect(findOneMock).toHaveBeenCalledWith({ _id: '507f1f77bcf86cd799439011', userId: 'user123' });
    expect(doc.title).toBe('Updated dentist');
    expect(doc.date).toBe('2024-04-06');
    expect(doc.timeStart).toBe('10:30');
    expect(doc.save).toHaveBeenCalled();
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ title: 'Updated dentist', date: '2024-04-06' });
  });

  it('prevents updating another user appointment', async () => {
    findOneMock.mockResolvedValue(null);

    const res = await request(app)
      .patch('/api/appointments/507f1f77bcf86cd799439011')
      .send({ title: 'Nope' });

    expect(findOneMock).toHaveBeenCalledWith({ _id: '507f1f77bcf86cd799439011', userId: 'user123' });
    expect(res.status).toBe(404);
  });

  it('updates an owned recurring appointment series', async () => {
    const doc = {
      _id: '507f1f77bcf86cd799439011',
      userId: 'user123',
      title: 'Therapy',
      date: null,
      startDate: '2024-04-03',
      rrule: 'FREQ=WEEKLY;BYDAY=WE',
      until: '',
      save: vi.fn().mockResolvedValue(undefined),
    };
    findOneMock.mockResolvedValue(doc);

    const res = await request(app)
      .patch('/api/appointments/507f1f77bcf86cd799439011')
      .send({ title: 'Updated therapy', startDate: '2024-04-10', rrule: 'FREQ=WEEKLY;INTERVAL=1;BYDAY=WE', until: '2024-06-01' });

    expect(doc.title).toBe('Updated therapy');
    expect(doc.startDate).toBe('2024-04-10');
    expect(doc.rrule).toBe('FREQ=WEEKLY;INTERVAL=1;BYDAY=WE');
    expect(doc.until).toBe('2024-06-01');
    expect(doc.save).toHaveBeenCalled();
    expect(res.status).toBe(200);
  });

  it('deletes an owned one-off appointment', async () => {
    findOneAndDeleteMock.mockResolvedValue({ _id: '507f1f77bcf86cd799439011', title: 'Dentist' });

    const res = await request(app).delete('/api/appointments/507f1f77bcf86cd799439011');

    expect(findOneAndDeleteMock).toHaveBeenCalledWith({ _id: '507f1f77bcf86cd799439011', userId: 'user123' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, deleted: '507f1f77bcf86cd799439011' });
  });

  it('prevents deleting another user appointment', async () => {
    findOneAndDeleteMock.mockResolvedValue(null);

    const res = await request(app).delete('/api/appointments/507f1f77bcf86cd799439011');

    expect(findOneAndDeleteMock).toHaveBeenCalledWith({ _id: '507f1f77bcf86cd799439011', userId: 'user123' });
    expect(res.status).toBe(404);
  });

  it('deletes an owned recurring appointment series document', async () => {
    findOneAndDeleteMock.mockResolvedValue({
      _id: '507f1f77bcf86cd799439011',
      title: 'Therapy',
      rrule: 'FREQ=WEEKLY;BYDAY=WE',
    });

    const res = await request(app).delete('/api/appointments/507f1f77bcf86cd799439011');

    expect(findOneAndDeleteMock).toHaveBeenCalledWith({ _id: '507f1f77bcf86cd799439011', userId: 'user123' });
    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe('507f1f77bcf86cd799439011');
  });
});
