import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const mocks = vi.hoisted(() => ({
  appointmentFind: vi.fn(),
  eventFind: vi.fn(),
  rippleFind: vi.fn(),
  suggestedGatherFind: vi.fn(),
  suggestedInterestFind: vi.fn(),
  suggestedScheduleFind: vi.fn(),
  suggestedTaskFind: vi.fn(),
  entryFind: vi.fn(),
}));

function makeQuery(rows) {
  return {
    populate: vi.fn(function populate() { return this; }),
    sort: vi.fn(function sort() { return this; }),
    limit: vi.fn(function limit() { return this; }),
    lean: vi.fn(async () => rows),
  };
}

vi.mock('../../models/Appointment.js', () => ({
  default: { find: (...args) => mocks.appointmentFind(...args) },
}));

vi.mock('../../models/ImportantEvent.js', () => ({
  default: { find: (...args) => mocks.eventFind(...args) },
}));

vi.mock('../../models/Ripple.js', () => ({
  default: { find: (...args) => mocks.rippleFind(...args) },
}));

vi.mock('../../models/SuggestedGatherItem.js', () => ({
  default: { find: (...args) => mocks.suggestedGatherFind(...args) },
}));

vi.mock('../../models/SuggestedInterest.js', () => ({
  default: { find: (...args) => mocks.suggestedInterestFind(...args) },
}));

vi.mock('../../models/SuggestedTask.js', () => ({
  default: { find: (...args) => mocks.suggestedTaskFind(...args) },
}));

vi.mock('../../models/SuggestedSchedule.js', () => ({
  default: { find: (...args) => mocks.suggestedScheduleFind(...args) },
}));

vi.mock('../../models/Entry.js', () => ({
  default: { find: (...args) => mocks.entryFind(...args) },
}));

const router = (await import('../review.js')).default;

function makeApp(user = { userId: 'user123' }) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = user;
    next();
  });
  app.use('/api/review', router);
  return app;
}

describe('review inbox route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.entryFind.mockReturnValue(makeQuery([
      { _id: 'entry-1', date: '2026-06-08', text: 'Call the dentist', deletedAt: null },
      { _id: 'entry-2', date: '2026-06-07', text: 'Remember printer ink before the next office day.', deletedAt: null },
      { _id: 'entry-3', date: '2026-06-06', html: '<p>Look into tap dance classes this fall.</p>', deletedAt: null },
      { _id: 'entry-4', date: '2026-06-08', content: 'Therapy is probably Thursday morning at 10.', deletedAt: null },
      { _id: 'entry-5', date: '2026-06-08', text: 'Tax deadline is coming up in mid June.', deletedAt: null },
    ]));
    mocks.suggestedScheduleFind.mockReturnValue(makeQuery([]));
  });

  it('returns normalized pending review items and hides ripples represented by task suggestions', async () => {
    const suggestedTaskQuery = makeQuery([
      {
        _id: 'suggestion-task-1',
        title: 'Call the dentist',
        status: 'pending',
        dueDate: new Date('2026-06-09T00:00:00.000Z'),
        sourceRippleId: {
          _id: 'ripple-task',
          entryId: 'entry-1',
          dateKey: '2026-06-08',
          text: 'Call the dentist',
        },
      },
    ]);
    mocks.suggestedTaskFind.mockReturnValue(suggestedTaskQuery);
    mocks.suggestedGatherFind.mockReturnValue(makeQuery([
      {
        _id: 'suggestion-gather-1',
        title: 'Printer ink',
        status: 'pending',
        list: 'Office',
        sourceEntryId: {
          _id: 'entry-2',
          date: '2026-06-07',
          title: 'Office',
          text: 'Remember printer ink before the next office day.',
        },
      },
    ]));
    mocks.suggestedInterestFind.mockReturnValue(makeQuery([
      {
        _id: 'suggestion-interest-1',
        title: 'Tap dance',
        status: 'pending',
        category: 'Movement',
        sourceEntryId: {
          _id: 'entry-3',
          date: '2026-06-06',
          title: 'Ideas',
          html: '<p>Look into tap dance classes this fall.</p>',
        },
      },
    ]));
    mocks.rippleFind.mockReturnValue(makeQuery([
      { _id: 'ripple-task', text: 'Call the dentist', status: 'pending', dateKey: '2026-06-08' },
      { _id: 'ripple-free', text: 'Book a haircut', status: 'pending', dateKey: '2026-06-10' },
    ]));
    mocks.appointmentFind.mockReturnValue(makeQuery([
      {
        _id: 'appointment-1',
        title: 'Therapy',
        date: '2026-06-11',
        timeStart: '10:00',
        source: 'entry-automation',
        entryId: {
          _id: 'entry-4',
          date: '2026-06-08',
          title: 'Planning',
          content: 'Therapy is probably Thursday morning at 10.',
        },
      },
    ]));
    mocks.eventFind.mockReturnValue(makeQuery([
      {
        _id: 'event-1',
        title: 'Tax deadline',
        date: '2026-06-15',
        source: 'entry-automation',
        entryId: {
          _id: 'entry-5',
          date: '2026-06-08',
          title: 'Dates',
          text: 'Tax deadline is coming up in mid June.',
        },
      },
    ]));

    const res = await request(makeApp()).get('/api/review');

    expect(res.status).toBe(200);
    expect(mocks.suggestedTaskFind).toHaveBeenCalledWith({
      userId: 'user123',
      status: { $in: ['pending', 'accepting', 'rejecting'] },
    });
    expect(suggestedTaskQuery.populate).toHaveBeenCalledWith({
      path: 'sourceRippleId',
      select: 'entryId dateKey text',
      match: { userId: 'user123' },
    });
    expect(suggestedTaskQuery.limit).toHaveBeenCalledWith(200);
    expect(mocks.appointmentFind).toHaveBeenCalledWith({
      userId: 'user123',
      source: 'entry-automation',
      automationReviewStatus: { $nin: ['kept', 'dismissed'] },
    });
    expect(res.body.counts).toMatchObject({
      tasks: 1,
      gather: 1,
      interests: 1,
      ripples: 1,
      calendar: 2,
      total: 6,
    });
    expect(res.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'suggestion-task-1', kind: 'suggestedTask', group: 'tasks' }),
        expect.objectContaining({
          id: 'suggestion-gather-1',
          kind: 'suggestedGatherItem',
          group: 'gather',
          sourceEntryExcerpt: 'Remember printer ink before the next office day.',
        }),
        expect.objectContaining({
          id: 'suggestion-interest-1',
          kind: 'suggestedInterest',
          group: 'interests',
          sourceEntryExcerpt: 'Look into tap dance classes this fall.',
        }),
        expect.objectContaining({ id: 'ripple-free', kind: 'ripple', group: 'ripples' }),
        expect.objectContaining({
          id: 'appointment-1',
          kind: 'calendarAppointment',
          group: 'calendar',
          sourceEntryExcerpt: 'Therapy is probably Thursday morning at 10.',
        }),
        expect.objectContaining({
          id: 'event-1',
          kind: 'calendarEvent',
          group: 'calendar',
          sourceEntryExcerpt: 'Tax deadline is coming up in mid June.',
        }),
      ])
    );
    expect(res.body.items.some((item) => item.id === 'ripple-task')).toBe(false);
  });

  it('requires an authenticated user', async () => {
    const res = await request(makeApp(null)).get('/api/review');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
  });

  it('keeps review actions available while marking trashed and missing sources unavailable', async () => {
    mocks.suggestedTaskFind.mockReturnValue(makeQuery([]));
    mocks.suggestedInterestFind.mockReturnValue(makeQuery([]));
    mocks.rippleFind.mockReturnValue(makeQuery([]));
    mocks.appointmentFind.mockReturnValue(makeQuery([]));
    mocks.eventFind.mockReturnValue(makeQuery([]));
    mocks.suggestedGatherFind.mockReturnValue(makeQuery([
      { _id: 'trashed-suggestion', title: 'Private item', status: 'pending', sourceText: 'Private entry text', sourceEntryId: 'trashed-entry' },
      { _id: 'missing-suggestion', title: 'Missing item', status: 'pending', sourceText: 'Missing entry text', sourceEntryId: 'missing-entry' },
    ]));
    mocks.entryFind.mockReturnValue(makeQuery([
      { _id: 'trashed-entry', text: 'Private entry text', deletedAt: new Date('2026-06-08') },
    ]));

    const res = await request(makeApp()).get('/api/review');

    expect(res.status).toBe(200);
    expect(res.body.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'trashed-suggestion', sourceState: 'trashed', sourceAvailable: false, sourceText: '' }),
      expect.objectContaining({ id: 'missing-suggestion', sourceState: 'missing', sourceAvailable: false, sourceText: '' }),
    ]));
  });

  it('returns a grouped schedule with explicit additions and removals', async () => {
    mocks.suggestedTaskFind.mockReturnValue(makeQuery([]));
    mocks.suggestedGatherFind.mockReturnValue(makeQuery([]));
    mocks.suggestedInterestFind.mockReturnValue(makeQuery([]));
    mocks.rippleFind.mockReturnValue(makeQuery([]));
    mocks.appointmentFind.mockReturnValue(makeQuery([]));
    mocks.eventFind.mockReturnValue(makeQuery([]));
    mocks.suggestedScheduleFind.mockReturnValue(makeQuery([
      {
        _id: 'schedule-1',
        sourceEntryId: 'entry-schedule',
        label: 'Work',
        mode: 'update',
        periodStart: '2026-07-20',
        periodEnd: '2026-07-26',
        sourceText: 'Schedule updated. I do not work Wednesday. Thursday 11–7:30 now.',
        status: 'pending',
        changes: [
          {
            key: 'remove-wednesday',
            action: 'remove',
            selected: true,
            targetAppointmentId: 'appointment-wednesday',
            previous: { date: '2026-07-22', start: '12:00', end: '20:00' },
          },
          {
            key: 'add-thursday',
            action: 'add',
            selected: true,
            date: '2026-07-23',
            start: '11:00',
            end: '19:30',
          },
        ],
      },
    ]));
    mocks.entryFind.mockReturnValue(makeQuery([
      {
        _id: 'entry-schedule',
        date: '2026-07-19',
        text: 'Schedule updated. I do not work Wednesday. Thursday 11–7:30 now.',
        deletedAt: null,
      },
    ]));

    const res = await request(makeApp()).get('/api/review');

    expect(res.status).toBe(200);
    expect(res.body.counts.calendar).toBe(1);
    expect(res.body.items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'schedule-1',
        kind: 'scheduleSuggestion',
        group: 'calendar',
        mode: 'update',
        changes: expect.arrayContaining([
          expect.objectContaining({ action: 'remove', targetAppointmentId: 'appointment-wednesday' }),
          expect.objectContaining({ action: 'add', date: '2026-07-23' }),
        ]),
        sourceEntryExcerpt: 'Schedule updated. I do not work Wednesday. Thursday 11–7:30 now.',
      }),
    ]));
  });
});
