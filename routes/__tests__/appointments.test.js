import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';

const findMock = vi.fn();
const findOneMock = vi.fn();
const deleteOneMock = vi.fn();
const expandMock = vi.fn();
const createMock = vi.fn();
const clusterMocks = vi.hoisted(() => ({
  resolveClusterIdForOwner: vi.fn(),
}));

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
    deleteOne: (...args) => deleteOneMock(...args),
    create: (...args) => createMock(...args),
  }
}));

vi.mock('../../utils/recurrence.js', () => ({
  expandDatesInRange: (...args) => expandMock(...args),
  isValidISODate: (value) => {
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return false;
    const date = new Date(`${value}T12:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  },
  parseRRule: (value = '') => Object.fromEntries(String(value).split(';').map((part) => part.split('='))),
}));

vi.mock('../../utils/clusterIds.js', () => ({
  normalizeClusterIds: (ids = []) => ids,
  resolveClusterIdForOwner: clusterMocks.resolveClusterIdForOwner,
  resolveClusterIdsForOwner: async (_userId, ids = []) => ids,
}));

vi.mock('../../utils/ownedReferences.js', () => ({
  resolveOwnedEntryId: async (_userId, value) => value || null,
}));

const router = (await import('../appointments.js')).default;

describe('GET /api/appointments date handling', () => {
  let app;

  beforeEach(() => {
    vi.clearAllMocks();
    clusterMocks.resolveClusterIdForOwner.mockResolvedValue(null);
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

  it('rejects a range when either supplied bound is invalid', async () => {
    const res = await request(app).get('/api/appointments?from=not-a-date&to=2024-02-01');
    expect(res.status).toBe(400);
    expect(findMock).not.toHaveBeenCalled();
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

  it('combines canonical and legacy cluster filters without overwriting recurrence bounds', async () => {
    const capturedQueries = [];
    clusterMocks.resolveClusterIdForOwner.mockResolvedValue('resolved-cluster-id');
    findMock
      .mockImplementationOnce((query) => {
        capturedQueries.push(query);
        return { sort: () => ({ lean: async () => [] }) };
      })
      .mockImplementationOnce((query) => {
        capturedQueries.push(query);
        return { lean: async () => [] };
      });

    const res = await request(app)
      .get('/api/appointments?from=2024-01-01&to=2024-01-31&cluster=focus-zone');

    expect(res.status).toBe(200);
    expect(capturedQueries[0].$and).toEqual([
      { $or: [{ clusters: 'resolved-cluster-id' }, { cluster: 'focus-zone' }] },
    ]);
    expect(capturedQueries[1].$and).toEqual([
      { $or: [{ clusters: 'resolved-cluster-id' }, { cluster: 'focus-zone' }] },
      { $or: [{ until: null }, { until: { $gte: '2024-01-01' } }, { until: '' }] },
    ]);
    expect(capturedQueries[1].$or).toBeUndefined();
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

  it('returns a conflict instead of a generic server error for duplicate appointments', async () => {
    createMock.mockRejectedValueOnce(Object.assign(new Error('duplicate key'), { code: 11000 }));

    const res = await request(app)
      .post('/api/appointments')
      .send({ title: 'Doctor appointment', date: '2024-04-05', timeStart: '15:00' });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain('already exists');
  });

  it.each([
    [{ title: 'Bad date', date: '2024-02-31' }, 'date'],
    [{ title: 'Bad start', date: '2024-04-05', timeStart: '25:00' }, 'timeStart'],
    [{ title: 'Backwards', date: '2024-04-05', timeStart: '15:00', timeEnd: '14:59' }, 'timeEnd'],
    [{ title: 'Bad recurrence', startDate: '2024-04-05', rrule: 'FREQ=YEARLY' }, 'rrule'],
    [{ title: 'Bad end', startDate: '2024-04-05', rrule: 'FREQ=WEEKLY', until: '2024-04-01' }, 'until'],
  ])('rejects invalid appointment input without writing it', async (body, errorPart) => {
    const res = await request(app).post('/api/appointments').send(body);

    expect(res.status).toBe(400);
    expect(res.body.error).toContain(errorPart);
    expect(createMock).not.toHaveBeenCalled();
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

  it('reports a duplicate conflict when an appointment edit collides', async () => {
    const doc = {
      _id: '507f1f77bcf86cd799439011',
      userId: 'user123',
      title: 'Dentist',
      date: '2024-04-05',
      rrule: '',
      save: vi.fn().mockRejectedValue(Object.assign(new Error('duplicate key'), { code: 11000 })),
    };
    findOneMock.mockResolvedValue(doc);

    const res = await request(app)
      .patch('/api/appointments/507f1f77bcf86cd799439011')
      .send({ title: 'Doctor appointment', date: '2024-04-05', timeStart: '15:00' });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain('already exists');
  });

  it('records keep and dismiss decisions without mislabelling automation as user-edited', async () => {
    const doc = {
      _id: '507f1f77bcf86cd799439011',
      userId: 'user123',
      source: 'entry-automation',
      automationReviewStatus: 'pending',
      save: vi.fn().mockResolvedValue(undefined),
    };
    findOneMock.mockResolvedValue(doc);

    const keep = await request(app)
      .patch('/api/appointments/507f1f77bcf86cd799439011/review')
      .send({ action: 'keep' });

    expect(keep.status).toBe(200);
    expect(findOneMock).toHaveBeenCalledWith({
      _id: '507f1f77bcf86cd799439011',
      userId: 'user123',
      source: 'entry-automation',
    });
    expect(doc.automationReviewStatus).toBe('kept');
    expect(doc.source).toBe('entry-automation');

    const dismiss = await request(app)
      .patch('/api/appointments/507f1f77bcf86cd799439011/review')
      .send({ action: 'dismiss' });
    expect(dismiss.status).toBe(200);
    expect(doc.automationReviewStatus).toBe('dismissed');
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
    findOneMock.mockResolvedValue({ _id: '507f1f77bcf86cd799439011', title: 'Dentist' });
    deleteOneMock.mockResolvedValue({ deletedCount: 1 });

    const res = await request(app).delete('/api/appointments/507f1f77bcf86cd799439011');

    expect(findOneMock).toHaveBeenCalledWith({ _id: '507f1f77bcf86cd799439011', userId: 'user123' });
    expect(deleteOneMock).toHaveBeenCalledWith({ _id: '507f1f77bcf86cd799439011', userId: 'user123' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, deleted: '507f1f77bcf86cd799439011' });
  });

  it('prevents deleting another user appointment', async () => {
    findOneMock.mockResolvedValue(null);

    const res = await request(app).delete('/api/appointments/507f1f77bcf86cd799439011');

    expect(findOneMock).toHaveBeenCalledWith({ _id: '507f1f77bcf86cd799439011', userId: 'user123' });
    expect(res.status).toBe(404);
  });

  it('deletes an owned recurring appointment series document', async () => {
    findOneMock.mockResolvedValue({
      _id: '507f1f77bcf86cd799439011',
      title: 'Therapy',
      rrule: 'FREQ=WEEKLY;BYDAY=WE',
    });

    const res = await request(app).delete('/api/appointments/507f1f77bcf86cd799439011');

    expect(findOneMock).toHaveBeenCalledWith({ _id: '507f1f77bcf86cd799439011', userId: 'user123' });
    expect(deleteOneMock).toHaveBeenCalledWith({ _id: '507f1f77bcf86cd799439011', userId: 'user123' });
    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe('507f1f77bcf86cd799439011');
  });

  it('keeps a dismissal tombstone when deleting an entry-derived appointment', async () => {
    const appointment = {
      _id: '507f1f77bcf86cd799439011',
      entryId: '507f1f77bcf86cd799439012',
      source: 'user-edited',
      automationReviewStatus: 'kept',
      save: vi.fn().mockResolvedValue(undefined),
    };
    findOneMock.mockResolvedValue(appointment);

    const res = await request(app).delete('/api/appointments/507f1f77bcf86cd799439011');

    expect(res.status).toBe(200);
    expect(appointment).toMatchObject({
      source: 'entry-automation',
      automationReviewStatus: 'dismissed',
    });
    expect(appointment.save).toHaveBeenCalled();
    expect(deleteOneMock).not.toHaveBeenCalled();
  });
});
