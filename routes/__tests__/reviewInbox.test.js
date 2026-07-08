import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const mocks = vi.hoisted(() => ({
  appointmentFind: vi.fn(),
  eventFind: vi.fn(),
  rippleFind: vi.fn(),
  suggestedGatherFind: vi.fn(),
  suggestedInterestFind: vi.fn(),
  suggestedTaskFind: vi.fn(),
}));

function makeQuery(rows) {
  return {
    populate: vi.fn(function populate() { return this; }),
    sort: vi.fn(function sort() { return this; }),
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
  });

  it('returns normalized pending review items and hides ripples represented by task suggestions', async () => {
    mocks.suggestedTaskFind.mockReturnValue(makeQuery([
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
    ]));
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
    expect(mocks.suggestedTaskFind).toHaveBeenCalledWith({ userId: 'user123', status: 'pending' });
    expect(mocks.appointmentFind).toHaveBeenCalledWith({ userId: 'user123', source: 'entry-automation' });
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
});
