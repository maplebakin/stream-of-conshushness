import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import express from 'express';

const appointmentFind = vi.fn();
const eventFind = vi.fn();
const entryFind = vi.fn();

vi.mock('../../middleware/auth.js', () => ({
  default: (req, _res, next) => {
    req.user = { userId: 'user123' };
    next();
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

vi.mock('../../models/Entry.js', () => ({
  default: {
    find: (...args) => entryFind(...args),
  },
}));

const router = (await import('../horizon.js')).default;

function makeApp() {
  const app = express();
  app.use('/api/horizon', router);
  return app;
}

function eventQuery(rows = []) {
  return {
    sort: vi.fn(() => ({
      lean: vi.fn(async () => rows),
    })),
  };
}

function entryQuery(rows = []) {
  return {
    select: vi.fn(() => ({
      lean: vi.fn(async () => rows),
    })),
  };
}

describe('horizon routes', () => {
  let app;

  beforeEach(() => {
    vi.clearAllMocks();
    app = makeApp();
    entryFind.mockReturnValue(entryQuery([]));
  });

  it('returns appointments and important events in one sorted upcoming list with source links', async () => {
    appointmentFind
      .mockResolvedValueOnce([
        {
          _id: 'appt-late',
          title: 'Doctor appointment',
          date: '2024-04-03',
          timeStart: '15:00',
          timeEnd: null,
          time: null,
          rrule: '',
          entryId: 'entry-appt',
          details: '',
          location: '',
          cluster: 'health',
          clusters: [],
        },
        {
          _id: 'appt-past',
          title: 'Past appointment',
          date: '2024-03-31',
          timeStart: '09:00',
          rrule: '',
        },
      ])
      .mockResolvedValueOnce([]);
    eventFind.mockReturnValue(eventQuery([
      {
        _id: 'event-today',
        title: 'Rent due',
        date: '2024-04-01',
        entryId: 'entry-event',
        description: '',
        cluster: 'home',
        pinned: true,
      },
      {
        _id: 'event-tomorrow',
        title: 'School trip',
        date: '2024-04-02',
        description: '',
      },
    ]));
    entryFind.mockReturnValue(entryQuery([
      { _id: 'entry-appt', text: 'I have a doctor appointment at 3pm on April 3.', date: '2024-04-01' },
      { _id: 'entry-event', text: 'Rent is due April 1.', date: '2024-03-28' },
    ]));

    const res = await request(app).get('/api/horizon?from=2024-04-01&days=7');

    expect(res.status).toBe(200);
    expect(res.body.items.map((item) => item.id)).toEqual(['event-today', 'event-tomorrow', 'appt-late']);
    expect(res.body.items).toMatchObject([
      {
        id: 'event-today',
        type: 'importantEvent',
        title: 'Rent due',
        date: '2024-04-01',
        daysUntil: 0,
        countdownLabel: 'Today',
        displayLabel: 'Today: Rent due',
        entryId: 'entry-event',
        sourceEntryId: 'entry-event',
        sourceText: 'Rent is due April 1.',
        pinned: true,
      },
      {
        id: 'event-tomorrow',
        type: 'importantEvent',
        title: 'School trip',
        date: '2024-04-02',
        daysUntil: 1,
        countdownLabel: 'Tomorrow',
        displayLabel: 'Tomorrow: School trip',
      },
      {
        id: 'appt-late',
        type: 'appointment',
        title: 'Doctor appointment',
        date: '2024-04-03',
        time: '15:00',
        daysUntil: 2,
        countdownLabel: '2 days until',
        displayLabel: '2 days until Doctor appointment',
        entryId: 'entry-appt',
        sourceText: 'I have a doctor appointment at 3pm on April 3.',
      },
    ]);
    expect(res.body.items.find((item) => item.id === 'appt-past')).toBeUndefined();
  });

  it('includes recurring appointment instances in the horizon window', async () => {
    appointmentFind
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          _id: 'series1',
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
        },
      ]);
    eventFind.mockReturnValue(eventQuery([]));

    const res = await request(app).get('/api/horizon?from=2024-04-01&days=14');

    expect(res.status).toBe(200);
    expect(res.body.items).toMatchObject([
      {
        id: 'virtual:series1:2024-04-03',
        type: 'appointment',
        title: 'Therapy',
        date: '2024-04-03',
        time: '09:00',
        daysUntil: 2,
        isRecurringInstance: true,
        seriesId: 'series1',
      },
      {
        id: 'virtual:series1:2024-04-10',
        type: 'appointment',
        title: 'Therapy',
        date: '2024-04-10',
        daysUntil: 9,
        isRecurringInstance: true,
        seriesId: 'series1',
      },
    ]);
  });

  it('marks trashed and missing horizon sources without returning their journal text', async () => {
    appointmentFind.mockResolvedValueOnce([
      { _id: 'trashed-appt', title: 'Private source', date: '2024-04-03', entryId: 'trashed-entry' },
    ]).mockResolvedValueOnce([]);
    eventFind.mockReturnValue(eventQuery([
      { _id: 'missing-event', title: 'Missing source', date: '2024-04-04', entryId: 'missing-entry' },
    ]));
    entryFind.mockReturnValue(entryQuery([
      { _id: 'trashed-entry', date: '2024-04-01', text: 'Private entry text', deletedAt: new Date('2024-04-02') },
    ]));

    const res = await request(app).get('/api/horizon?from=2024-04-01&days=7');

    expect(res.status).toBe(200);
    expect(res.body.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'trashed-appt', sourceState: 'trashed', sourceAvailable: false, sourceText: '' }),
      expect.objectContaining({ id: 'missing-event', sourceState: 'missing', sourceAvailable: false, sourceText: '' }),
    ]));
  });
});
