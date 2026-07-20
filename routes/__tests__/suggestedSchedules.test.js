import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';

const { ObjectId } = mongoose.Types;
const store = vi.hoisted(() => ({
  suggestions: [],
  appointments: [],
  entries: [],
}));

function sameId(left, right) {
  return String(left || '') === String(right || '');
}

function savedDocument(value) {
  return {
    ...value,
    save: vi.fn(async function save() { return this; }),
  };
}

function appointmentMatches(item, query) {
  if (query._id && !sameId(item._id, query._id)) return false;
  if (query.userId && !sameId(item.userId, query.userId)) return false;
  if (query.scheduleLabel && item.scheduleLabel !== query.scheduleLabel) return false;
  if (query.scheduleSuggestionId && !sameId(item.scheduleSuggestionId, query.scheduleSuggestionId)) return false;
  if (query.scheduleChangeKey && item.scheduleChangeKey !== query.scheduleChangeKey) return false;
  return true;
}

vi.mock('../../models/SuggestedSchedule.js', () => ({
  default: {
    findOne: vi.fn(async (query) => store.suggestions.find((item) => (
      sameId(item._id, query._id) && sameId(item.userId, query.userId)
    )) || null),
  },
}));

vi.mock('../../models/Entry.js', () => ({
  default: {
    findOne: vi.fn((query) => ({
      select: async () => store.entries.find((item) => (
        sameId(item._id, query._id) && sameId(item.userId, query.userId)
      )) || null,
    })),
  },
}));

vi.mock('../../models/Appointment.js', () => ({
  default: {
    findOne: vi.fn(async (query) => store.appointments.find((item) => appointmentMatches(item, query)) || null),
    find: vi.fn((query) => ({
      then: (resolve) => resolve(store.appointments.filter((item) => (
        sameId(item.userId, query.userId) &&
        (query._id?.$in || []).some((id) => sameId(item._id, id))
      ))),
    })),
    create: vi.fn(async (payload) => {
      const appointment = savedDocument({ _id: new ObjectId(), ...payload });
      store.appointments.push(appointment);
      return appointment;
    }),
  },
}));

const router = (await import('../suggestedSchedules.js')).default;

function makeApp(userId) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { userId };
    next();
  });
  app.use('/api/suggested-schedules', router);
  return app;
}

function change(overrides = {}) {
  return {
    key: `change-${Math.random()}`,
    action: 'add',
    selected: true,
    targetAppointmentId: null,
    candidateAppointmentIds: [],
    candidateAppointments: [],
    previous: {},
    date: '2026-07-20',
    start: '10:00',
    end: '15:00',
    title: 'Work',
    location: '',
    warnings: [],
    ...overrides,
  };
}

function suggestionFor(userId, entryId, changes) {
  return savedDocument({
    _id: new ObjectId(),
    userId,
    sourceEntryId: entryId,
    automationRevision: 1,
    scheduleGroupId: 'work:2026-07-20:2026-07-26',
    label: 'Work',
    mode: 'capture',
    periodStart: '2026-07-20',
    periodEnd: '2026-07-26',
    status: 'pending',
    changes,
    acceptedChangeKeys: [],
    appliedAppointmentIds: [],
  });
}

describe('grouped schedule suggestion acceptance', () => {
  let userId;
  let otherUserId;
  let entryId;

  beforeEach(() => {
    vi.clearAllMocks();
    store.suggestions = [];
    store.appointments = [];
    store.entries = [];
    userId = new ObjectId();
    otherUserId = new ObjectId();
    entryId = new ObjectId();
    store.entries.push({ _id: entryId, userId });
  });

  it('accepts all additions as separate provenance-linked appointments', async () => {
    const suggestion = suggestionFor(userId, entryId, [
      change({ key: 'mon', date: '2026-07-20' }),
      change({ key: 'wed', date: '2026-07-22', start: '12:00', end: '20:00' }),
      change({ key: 'fri', date: '2026-07-24', start: '07:50', end: '13:50' }),
    ]);
    store.suggestions.push(suggestion);

    const response = await request(makeApp(userId))
      .put(`/api/suggested-schedules/${suggestion._id}/accept`)
      .send({});

    expect(response.status).toBe(200);
    expect(store.appointments).toHaveLength(3);
    expect(store.appointments.every((item) => (
      item.title === 'Work' &&
      item.source === 'entry-automation' &&
      item.automationReviewStatus === 'kept' &&
      sameId(item.entryId, entryId) &&
      item.scheduleGroupId === suggestion.scheduleGroupId
    ))).toBe(true);
    expect(suggestion.status).toBe('accepted');
  });

  it('accepts only selected edits and is idempotent on retry', async () => {
    const suggestion = suggestionFor(userId, entryId, [
      change({ key: 'mon' }),
      change({ key: 'wed', date: '2026-07-22' }),
    ]);
    store.suggestions.push(suggestion);
    const payload = {
      changes: [
        { key: 'mon', selected: true, date: '2026-07-21', start: '11:00', end: '16:00' },
        { key: 'wed', selected: false },
      ],
    };

    const first = await request(makeApp(userId))
      .put(`/api/suggested-schedules/${suggestion._id}/accept`)
      .send(payload);
    const retry = await request(makeApp(userId))
      .put(`/api/suggested-schedules/${suggestion._id}/accept`)
      .send(payload);

    expect(first.status).toBe(200);
    expect(retry.status).toBe(200);
    expect(retry.body.idempotent).toBe(true);
    expect(store.appointments).toHaveLength(1);
    expect(store.appointments[0]).toMatchObject({
      date: '2026-07-21',
      timeStart: '11:00',
      timeEnd: '16:00',
    });
  });

  it('removes and changes only linked owner schedule artifacts while preserving history', async () => {
    const removeTarget = savedDocument({
      _id: new ObjectId(),
      userId,
      title: 'Work',
      date: '2026-07-22',
      timeStart: '12:00',
      timeEnd: '20:00',
      scheduleLabel: 'Work',
      scheduleStatus: 'active',
      scheduleSourceEntryIds: [],
      appliedScheduleChangeKeys: [],
      scheduleHistory: [],
    });
    const changeTarget = savedDocument({
      ...removeTarget,
      _id: new ObjectId(),
      date: '2026-07-24',
      timeStart: '07:50',
      timeEnd: '13:50',
      scheduleHistory: [],
      appliedScheduleChangeKeys: [],
    });
    const unrelated = savedDocument({
      _id: new ObjectId(),
      userId,
      title: 'Dentist',
      date: '2026-07-22',
      timeStart: '12:00',
      timeEnd: '13:00',
      scheduleLabel: '',
      scheduleStatus: 'active',
    });
    store.appointments.push(removeTarget, changeTarget, unrelated);
    const suggestion = suggestionFor(userId, entryId, [
      change({
        key: 'remove-wed',
        action: 'remove',
        targetAppointmentId: removeTarget._id,
        candidateAppointmentIds: [removeTarget._id],
        previous: { date: removeTarget.date, start: removeTarget.timeStart, end: removeTarget.timeEnd },
        date: '',
        start: '',
        end: '',
      }),
      change({
        key: 'change-fri',
        action: 'change',
        targetAppointmentId: changeTarget._id,
        candidateAppointmentIds: [changeTarget._id],
        previous: { date: changeTarget.date, start: changeTarget.timeStart, end: changeTarget.timeEnd },
        date: '2026-07-24',
        start: '10:00',
        end: '15:00',
      }),
    ]);
    store.suggestions.push(suggestion);

    const response = await request(makeApp(userId))
      .put(`/api/suggested-schedules/${suggestion._id}/accept`)
      .send({});

    expect(response.status).toBe(200);
    expect(removeTarget.scheduleStatus).toBe('cancelled');
    expect(changeTarget).toMatchObject({ timeStart: '10:00', timeEnd: '15:00' });
    expect(removeTarget.scheduleHistory[0].action).toBe('remove');
    expect(changeTarget.scheduleHistory[0].action).toBe('change');
    expect(unrelated).toMatchObject({ title: 'Dentist', scheduleStatus: 'active' });
  });

  it('rejects without changing calendar artifacts', async () => {
    const suggestion = suggestionFor(userId, entryId, [change({ key: 'mon' })]);
    store.suggestions.push(suggestion);
    const response = await request(makeApp(userId))
      .put(`/api/suggested-schedules/${suggestion._id}/reject`)
      .send({});
    expect(response.status).toBe(200);
    expect(suggestion.status).toBe('rejected');
    expect(store.appointments).toHaveLength(0);
  });

  it('refuses an ambiguous destructive change until a prior shift is chosen', async () => {
    const suggestion = suggestionFor(userId, entryId, [
      change({
        key: 'ambiguous-remove',
        action: 'remove',
        targetAppointmentId: null,
        candidateAppointmentIds: [new ObjectId(), new ObjectId()],
        selected: true,
        date: '',
        start: '',
        end: '',
      }),
    ]);
    store.suggestions.push(suggestion);

    const response = await request(makeApp(userId))
      .put(`/api/suggested-schedules/${suggestion._id}/accept`)
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/Choose the existing shift/i);
    expect(store.appointments).toHaveLength(0);
    expect(suggestion.status).toBe('pending');
  });

  it('cannot accept another owner’s suggestion or target appointment', async () => {
    const suggestion = suggestionFor(otherUserId, new ObjectId(), [change({ key: 'mon' })]);
    store.suggestions.push(suggestion);
    const response = await request(makeApp(userId))
      .put(`/api/suggested-schedules/${suggestion._id}/accept`)
      .send({});
    expect(response.status).toBe(404);
    expect(store.appointments).toHaveLength(0);
  });
});
