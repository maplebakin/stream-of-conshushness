import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';

const taskFind = vi.fn();
const appointmentFind = vi.fn();
const eventFind = vi.fn();
const entryFind = vi.fn();

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

vi.mock('../../models/Entry.js', () => ({
  default: {
    find: (...args) => entryFind(...args),
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

function makeApp() {
  const app = express();
  app.use('/api/calendar', router);
  return app;
}

function recurringAppointment(overrides = {}) {
  return {
    _id: 'series1',
    userId: 'user123',
    title: 'Therapy',
    startDate: '2024-04-03',
    rrule: 'FREQ=WEEKLY;BYDAY=WE',
    until: '',
    timeStart: '09:00',
    timeEnd: null,
    time: null,
    location: '',
    details: '',
    cluster: '',
    clusters: [],
    tz: 'America/Toronto',
    ...overrides,
  };
}

describe('calendar routes', () => {
  let app;

  beforeEach(() => {
    vi.clearAllMocks();
    entryFind.mockReturnValue({ select: () => ({ lean: async () => [] }) });
    app = makeApp();
  });

  it('keeps one-off appointments visible in month aggregates', async () => {
    const queries = { task: null, appointments: [], event: null };
    taskFind.mockImplementation(async (query) => {
      queries.task = query;
      return [{ dueDate: '2024-04-15' }];
    });
    appointmentFind
      .mockImplementationOnce(async (query) => {
        queries.appointments.push(query);
        return [{ _id: 'appt1', date: '2024-04-20', title: 'Dentist', rrule: '' }];
      })
      .mockImplementationOnce(async (query) => {
        queries.appointments.push(query);
        return [];
      });
    eventFind.mockImplementation(async (query) => {
      queries.event = query;
      return [{ date: '2024-04-05' }];
    });

    const res = await request(app).get('/api/calendar/2024-04');

    expect(queries.task).toEqual({ userId: 'user123', deletedAt: null, completed: false, dueDate: { $gte: '2024-04-01', $lte: '2024-04-30' } });
    expect(queries.appointments[0]).toEqual({
      userId: 'user123',
      automationReviewStatus: { $nin: ['pending', 'dismissed'] },
      scheduleStatus: { $ne: 'cancelled' },
      date: { $gte: '2024-04-01', $lte: '2024-04-30' },
      rrule: '',
    });
    expect(queries.appointments[1]).toEqual({
      userId: 'user123',
      automationReviewStatus: { $nin: ['pending', 'dismissed'] },
      scheduleStatus: { $ne: 'cancelled' },
      rrule: { $ne: '' },
      startDate: { $lte: '2024-04-30' },
      $or: [{ until: null }, { until: { $gte: '2024-04-01' } }, { until: '' }],
    });
    expect(queries.event).toEqual({
      userId: 'user123',
      date: { $gte: '2024-04-01', $lte: '2024-04-30' },
      automationReviewStatus: { $nin: ['pending', 'dismissed'] },
    });
    expect(res.body.days).toEqual({
      '2024-04-05': { tasks: 0, appointments: 0, events: 1 },
      '2024-04-15': { tasks: 1, appointments: 0, events: 0 },
      '2024-04-20': { tasks: 0, appointments: 1, events: 0 },
    });
  });

  it('caps February at its actual end date', async () => {
    taskFind.mockResolvedValue([{ dueDate: '2023-02-10' }]);
    appointmentFind
      .mockResolvedValueOnce([{ date: '2023-02-28', title: 'One-off', rrule: '' }])
      .mockResolvedValueOnce([]);
    eventFind.mockResolvedValue([{ date: '2023-02-14' }]);

    const res = await request(app).get('/api/calendar/2023-02');

    expect(taskFind).toHaveBeenCalledWith({ userId: 'user123', deletedAt: null, completed: false, dueDate: { $gte: '2023-02-01', $lte: '2023-02-28' } }, 'dueDate');
    expect(appointmentFind).toHaveBeenNthCalledWith(1, {
      userId: 'user123',
      automationReviewStatus: { $nin: ['pending', 'dismissed'] },
      scheduleStatus: { $ne: 'cancelled' },
      date: { $gte: '2023-02-01', $lte: '2023-02-28' },
      rrule: '',
    });
    expect(eventFind).toHaveBeenCalledWith({
      userId: 'user123',
      date: { $gte: '2023-02-01', $lte: '2023-02-28' },
      automationReviewStatus: { $nin: ['pending', 'dismissed'] },
    }, 'date');
    expect(res.body.days).toEqual({
      '2023-02-10': { tasks: 1, appointments: 0, events: 0 },
      '2023-02-14': { tasks: 0, appointments: 0, events: 1 },
      '2023-02-28': { tasks: 0, appointments: 1, events: 0 },
    });
  });

  it.each(['not-a-month', '2024-00', '2024-13', '2024-1'])('rejects malformed month %s before querying', async (month) => {
    const res = await request(app).get(`/api/calendar/${month}`);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'month must be YYYY-MM' });
    expect(taskFind).not.toHaveBeenCalled();
    expect(appointmentFind).not.toHaveBeenCalled();
    expect(eventFind).not.toHaveBeenCalled();
  });

  it('rejects impossible day dates before querying', async () => {
    const res = await request(app).get('/api/calendar/day/2023-02-29');

    expect(res.status).toBe(400);
    expect(appointmentFind).not.toHaveBeenCalled();
    expect(eventFind).not.toHaveBeenCalled();
  });

  it('returns a controlled error when month loading fails', async () => {
    taskFind.mockRejectedValueOnce(new Error('database unavailable'));
    appointmentFind.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    eventFind.mockResolvedValueOnce([]);

    const res = await request(app).get('/api/calendar/2024-04');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Server error' });
  });

  it('returns a controlled error when upcoming loading fails', async () => {
    appointmentFind.mockRejectedValueOnce(new Error('database unavailable'));
    eventFind.mockReturnValue({ sort: () => [] });

    const res = await request(app).get('/api/calendar/upcoming/list?from=2024-04-01');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Server error' });
  });

  it('expands recurring appointments into matching month dates only', async () => {
    taskFind.mockResolvedValue([]);
    appointmentFind
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([recurringAppointment()]);
    eventFind.mockResolvedValue([]);

    const res = await request(app).get('/api/calendar/2024-04');

    expect(res.body.days).toEqual({
      '2024-04-03': { tasks: 0, appointments: 1, events: 0 },
      '2024-04-10': { tasks: 0, appointments: 1, events: 0 },
      '2024-04-17': { tasks: 0, appointments: 1, events: 0 },
      '2024-04-24': { tasks: 0, appointments: 1, events: 0 },
    });
    expect(res.body.days['2024-04-04']).toBeUndefined();
    expect(res.body.days['2024-05-01']).toBeUndefined();
  });

  it('includes recurring appointments in matching day view', async () => {
    appointmentFind
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([recurringAppointment()]);
    eventFind.mockReturnValue({ lean: async () => [] });

    const res = await request(app).get('/api/calendar/day/2024-04-10');

    expect(res.body.appointments).toHaveLength(1);
    expect(res.body.appointments[0]).toMatchObject({
      _id: 'virtual:series1:2024-04-10',
      title: 'Therapy',
      date: '2024-04-10',
      isRecurring: true,
      seriesId: 'series1',
    });
  });

  it('adds source entry metadata to source-linked day artifacts', async () => {
    appointmentFind
      .mockResolvedValueOnce([
        {
          _id: 'appt1',
          title: 'Visit',
          date: '2024-04-10',
          rrule: '',
          entryId: 'entry1',
          source: 'entry-automation',
        },
      ])
      .mockResolvedValueOnce([]);
    eventFind.mockReturnValue({
      lean: async () => [
        {
          _id: 'event1',
          title: 'Important visit',
          date: '2024-04-10',
          entryId: 'entry1',
          source: 'entry-automation',
        },
      ],
    });
    entryFind.mockReturnValue({
      select: () => ({
        lean: async () => [
          { _id: 'entry1', date: '2024-04-08', title: 'Source stream entry' },
        ],
      }),
    });

    const res = await request(app).get('/api/calendar/day/2024-04-10');

    expect(entryFind).toHaveBeenCalledWith({
      userId: 'user123',
      _id: { $in: ['entry1'] },
    });
    expect(res.body.appointments[0]).toMatchObject({
      source: 'entry-automation',
      sourceEntryId: 'entry1',
      sourceDate: '2024-04-08',
      sourceTitle: 'Source stream entry',
    });
    expect(res.body.importantEvents[0]).toMatchObject({
      source: 'entry-automation',
      sourceEntryId: 'entry1',
      sourceDate: '2024-04-08',
      sourceTitle: 'Source stream entry',
    });
  });

  it('resolves active, trashed, and missing source entries without dropping calendar artifacts', async () => {
    appointmentFind
      .mockResolvedValueOnce([
        { _id: 'active-artifact', title: 'Active', date: '2024-04-10', rrule: '', entryId: 'active-entry' },
        { _id: 'trashed-artifact', title: 'Trashed', date: '2024-04-10', rrule: '', entryId: 'trashed-entry' },
        { _id: 'missing-artifact', title: 'Missing', date: '2024-04-10', rrule: '', entryId: 'missing-entry' },
      ])
      .mockResolvedValueOnce([]);
    eventFind.mockReturnValue({ lean: async () => [] });
    entryFind.mockReturnValue({
      select: () => ({
        lean: async () => [
          { _id: 'active-entry', date: '2024-04-08', deletedAt: null },
          { _id: 'trashed-entry', date: '2024-04-07', text: 'Do not expose this', deletedAt: new Date('2024-04-09') },
        ],
      }),
    });

    const res = await request(app).get('/api/calendar/day/2024-04-10');

    expect(res.status).toBe(200);
    expect(res.body.appointments).toEqual(expect.arrayContaining([
      expect.objectContaining({ _id: 'active-artifact', sourceState: 'active', sourceAvailable: true, sourceDate: '2024-04-08' }),
      expect.objectContaining({ _id: 'trashed-artifact', sourceState: 'trashed', sourceAvailable: false, sourceEntryId: 'trashed-entry' }),
      expect.objectContaining({ _id: 'missing-artifact', sourceState: 'missing', sourceAvailable: false, sourceEntryId: 'missing-entry' }),
    ]));
    expect(res.body.appointments.find((item) => item._id === 'trashed-artifact')).not.toHaveProperty('sourceDate');
    expect(res.body.appointments.find((item) => item._id === 'trashed-artifact')).not.toHaveProperty('sourceTitle');
  });

  it('excludes recurring appointments from non-matching day view', async () => {
    appointmentFind
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([recurringAppointment()]);
    eventFind.mockReturnValue({ lean: async () => [] });

    const res = await request(app).get('/api/calendar/day/2024-04-11');

    expect(res.body.appointments).toEqual([]);
  });

  it('includes one-off and recurring appointments in upcoming results', async () => {
    appointmentFind
      .mockResolvedValueOnce([{ _id: 'one1', title: 'Dentist', date: '2024-04-05', rrule: '' }])
      .mockResolvedValueOnce([recurringAppointment()]);
    eventFind.mockReturnValue({ sort: () => [] });

    const res = await request(app).get('/api/calendar/upcoming/list?from=2024-04-01');

    expect(res.body.appointments).toMatchObject([
      { id: 'virtual:series1:2024-04-03', title: 'Therapy', date: '2024-04-03', daysUntil: 2, isRecurring: true, seriesId: 'series1' },
      { id: 'one1', title: 'Dentist', date: '2024-04-05', daysUntil: 4 },
      { id: 'virtual:series1:2024-04-10', title: 'Therapy', date: '2024-04-10', daysUntil: 9, isRecurring: true, seriesId: 'series1' },
      { id: 'virtual:series1:2024-04-17', title: 'Therapy', date: '2024-04-17', daysUntil: 16, isRecurring: true, seriesId: 'series1' },
      { id: 'virtual:series1:2024-04-24', title: 'Therapy', date: '2024-04-24', daysUntil: 23, isRecurring: true, seriesId: 'series1' },
      { id: 'virtual:series1:2024-05-01', title: 'Therapy', date: '2024-05-01', daysUntil: 30, isRecurring: true, seriesId: 'series1' },
      { id: 'virtual:series1:2024-05-08', title: 'Therapy', date: '2024-05-08', daysUntil: 37, isRecurring: true, seriesId: 'series1' },
      { id: 'virtual:series1:2024-05-15', title: 'Therapy', date: '2024-05-15', daysUntil: 44, isRecurring: true, seriesId: 'series1' },
      { id: 'virtual:series1:2024-05-22', title: 'Therapy', date: '2024-05-22', daysUntil: 51, isRecurring: true, seriesId: 'series1' },
      { id: 'virtual:series1:2024-05-29', title: 'Therapy', date: '2024-05-29', daysUntil: 58, isRecurring: true, seriesId: 'series1' },
    ]);
    expect(res.body.appointments[0]).toMatchObject({
      rrule: 'FREQ=WEEKLY;BYDAY=WE',
      startDate: '2024-04-03',
      timeStart: '09:00',
    });
  });
});
