import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';

const store = vi.hoisted(() => ({
  entries: [],
  appointments: [],
  importantEvents: [],
  schedules: [],
}));

const { ObjectId } = mongoose.Types;

function sameId(a, b) {
  return String(a) === String(b);
}

function makeEntry(doc) {
  return {
    _id: new ObjectId(),
    ...doc,
    clusters: doc.clusters || [],
    save: vi.fn(async function save() { return this; }),
    populate: vi.fn(async function populate() { return this; }),
  };
}

function withSelectLean(rows) {
  return {
    select: () => ({
      lean: async () => rows,
    }),
  };
}

function matchesOperator(itemValue, queryValue) {
  if (queryValue && typeof queryValue === 'object' && !Array.isArray(queryValue)) {
    if ('$ne' in queryValue && itemValue === queryValue.$ne) return false;
    if ('$in' in queryValue && !queryValue.$in.includes(itemValue)) return false;
    if ('$lt' in queryValue && !(itemValue < queryValue.$lt)) return false;
    if ('$exists' in queryValue && (itemValue !== undefined) !== queryValue.$exists) return false;
    return true;
  }
  return itemValue === queryValue;
}

function matchesBranch(item, branch) {
  return Object.entries(branch).every(([key, value]) => {
    if (key === '$or') return value.some((nested) => matchesBranch(item, nested));
    return matchesOperator(item[key], value);
  });
}

function matchesCalendarQuery(item, query) {
  return (
    sameId(item.userId, query.userId) &&
    (!query.entryId || sameId(item.entryId, query.entryId)) &&
    (!query.source || item.source === query.source) &&
    (!query.title || item.title === query.title) &&
    (!query.date || item.date === query.date) &&
    (!query.timeStart || item.timeStart === query.timeStart) &&
    (!Object.prototype.hasOwnProperty.call(query, 'automationReviewStatus') ||
      matchesOperator(item.automationReviewStatus, query.automationReviewStatus)) &&
    (!Object.prototype.hasOwnProperty.call(query, 'automationRevision') ||
      matchesOperator(item.automationRevision, query.automationRevision)) &&
    (!query.$or || query.$or.some((branch) => matchesBranch(item, branch)))
  );
}

vi.mock('../../models/Entry.js', () => ({
  default: {
    create: vi.fn(async (doc) => {
      const entry = makeEntry(doc);
      store.entries.push(entry);
      return entry;
    }),
    findOne: vi.fn(async (query) => store.entries.find((entry) => (
      sameId(entry._id, query._id) &&
      sameId(entry.userId, query.userId)
    )) || null),
  },
}));

vi.mock('../../models/Appointment.js', () => ({
  default: {
    find: vi.fn(() => ({
      sort: () => ({
        lean: async () => store.appointments.filter((item) => (
          item.scheduleLabel === 'Work' && item.scheduleStatus !== 'cancelled'
        )),
      }),
    })),
    findOne: vi.fn(async (query) => store.appointments.find((item) => matchesCalendarQuery(item, query)) || null),
    create: vi.fn(async (doc) => {
      const appointment = { _id: new ObjectId(), ...doc };
      store.appointments.push(appointment);
      return appointment;
    }),
    deleteMany: vi.fn(async (query) => {
      const before = store.appointments.length;
      store.appointments = store.appointments.filter((item) => !matchesCalendarQuery(item, query));
      return { deletedCount: before - store.appointments.length };
    }),
  },
}));

vi.mock('../../models/SuggestedSchedule.js', () => ({
  default: {
    create: vi.fn(async (doc) => {
      const suggestion = { _id: new ObjectId(), ...doc };
      store.schedules.push(suggestion);
      return suggestion;
    }),
    findOne: vi.fn(async (query) => store.schedules.find((item) => (
      sameId(item.userId, query.userId) &&
      sameId(item.sourceEntryId, query.sourceEntryId) &&
      item.automationRevision === query.automationRevision
    )) || null),
    deleteMany: vi.fn(async (query) => {
      const before = store.schedules.length;
      store.schedules = store.schedules.filter((item) => !(
        sameId(item.userId, query.userId) &&
        sameId(item.sourceEntryId, query.sourceEntryId) &&
        item.status === query.status &&
        (!query.automationRevision?.$lt || item.automationRevision < query.automationRevision.$lt)
      ));
      return { deletedCount: before - store.schedules.length };
    }),
  },
}));

vi.mock('../../models/ImportantEvent.js', () => ({
  default: {
    findOne: vi.fn(async (query) => store.importantEvents.find((item) => matchesCalendarQuery(item, query)) || null),
    create: vi.fn(async (doc) => {
      const event = { _id: new ObjectId(), ...doc };
      store.importantEvents.push(event);
      return event;
    }),
    deleteMany: vi.fn(async (query) => {
      const before = store.importantEvents.length;
      store.importantEvents = store.importantEvents.filter((item) => !matchesCalendarQuery(item, query));
      return { deletedCount: before - store.importantEvents.length };
    }),
  },
}));

vi.mock('../../utils/rippleExtractor.js', () => ({
  extractEntrySuggestions: () => [],
  extractRipplesFromEntry: () => ({ ripples: [] }),
}));

vi.mock('../../models/Ripple.js', () => ({
  default: {
    find: vi.fn(() => withSelectLean([])),
    deleteMany: vi.fn(),
    insertMany: vi.fn(async () => []),
    modelName: 'Ripple',
  },
}));

vi.mock('../../models/SuggestedTask.js', () => ({
  default: {
    deleteMany: vi.fn(),
    insertMany: vi.fn(async () => []),
    modelName: 'SuggestedTask',
  },
}));

vi.mock('../../models/SuggestedGatherItem.js', () => ({
  default: {
    deleteMany: vi.fn(),
    find: vi.fn(() => withSelectLean([])),
    insertMany: vi.fn(async () => []),
    modelName: 'SuggestedGatherItem',
  },
}));

vi.mock('../../models/GatherItem.js', () => ({
  default: {
    find: vi.fn(() => withSelectLean([])),
    modelName: 'GatherItem',
  },
}));

vi.mock('../../models/SuggestedInterest.js', () => ({
  default: {
    deleteMany: vi.fn(),
    find: vi.fn(() => withSelectLean([])),
    insertMany: vi.fn(async () => []),
    modelName: 'SuggestedInterest',
  },
}));

vi.mock('../../models/Interest.js', () => ({
  default: {
    find: vi.fn(() => withSelectLean([])),
    modelName: 'Interest',
  },
}));

vi.mock('../../models/Task.js', () => ({
  default: {
    insertMany: vi.fn(async () => []),
    modelName: 'Task',
  },
}));

vi.mock('../../models/Cluster.js', () => ({
  default: {
    find: vi.fn(() => ({
      select: () => ({
        lean: async () => [],
      }),
    })),
    findOne: vi.fn((query) => ({
      select: () => ({
        lean: async () => query?._id ? { _id: query._id } : null,
      }),
    })),
  },
}));

vi.mock('../../utils/ownedReferences.js', () => ({
  resolveOwnedGoalId: async (_userId, value) => value || null,
  resolveOwnedSectionId: async (_userId, value) => value || null,
  resolveOwnedSectionPageId: async (_userId, value) => value || null,
}));

const entriesRouter = (await import('../entries.js')).default;
const visitMomText = "I'm going to visit my mom on the 13th! It'll be the first time I've visited as really myself and not as a mom since I've had Colton, I'm really looking forward to it.";

describe('entry calendar automation artifacts', () => {
  const userId = new ObjectId();
  let app;

  beforeEach(() => {
    store.entries = [];
    store.appointments = [];
    store.importantEvents = [];
    store.schedules = [];

    app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.user = { userId };
      next();
    });
    app.use('/api/entries', entriesRouter);
  });

  it('does not duplicate an appointment when the same entry text is saved again', async () => {
    const text = "I have a doctor's appointment at 3pm on June 25th.";
    const entryRes = await request(app)
      .post('/api/entries')
      .send({ date: '2026-06-08', text });

    expect(entryRes.status).toBe(201);
    const entry = store.entries[0];
    const appointmentId = String(store.appointments[0]._id);
    expect(store.appointments).toHaveLength(1);
    expect(store.appointments[0]).toMatchObject({
      title: "Doctor's appointment",
      date: '2026-06-25',
      timeStart: '15:00',
      entryId: entry._id,
      source: 'entry-automation',
    });

    const updateRes = await request(app)
      .patch(`/api/entries/${entry._id}`)
      .send({ text });

    expect(updateRes.status).toBe(200);
    expect(store.appointments).toHaveLength(1);
    expect(String(store.appointments[0]._id)).toBe(appointmentId);
    expect(store.appointments[0]).toMatchObject({
      title: "Doctor's appointment",
      date: '2026-06-25',
      timeStart: '15:00',
      entryId: entry._id,
      source: 'entry-automation',
    });
  });

  it('replaces an automation-created appointment when entry text changes', async () => {
    const entryRes = await request(app)
      .post('/api/entries')
      .send({
        date: '2026-06-08',
        text: "I have a doctor's appointment at 3pm on June 25th.",
      });

    expect(entryRes.status).toBe(201);
    const entry = store.entries[0];
    expect(store.appointments).toHaveLength(1);
    const userEditedAppointment = {
      _id: new ObjectId(),
      userId,
      entryId: entry._id,
      title: 'Rescheduled personal appointment',
      date: '2026-06-27',
      timeStart: '10:00',
      source: 'user-edited',
    };
    const manualImportantEvent = {
      _id: new ObjectId(),
      userId,
      entryId: entry._id,
      title: 'Manual reminder',
      date: '2026-06-28',
      source: 'manual',
    };
    store.appointments.push(userEditedAppointment);
    store.importantEvents.push(manualImportantEvent);

    const updateRes = await request(app)
      .patch(`/api/entries/${entry._id}`)
      .send({ text: 'I have a dentist appointment at 4pm on June 26th.' });

    expect(updateRes.status).toBe(200);
    expect(store.appointments).toHaveLength(2);
    expect(store.appointments.find((item) => item.source === 'entry-automation')).toMatchObject({
      title: 'Dentist appointment',
      date: '2026-06-26',
      timeStart: '16:00',
      entryId: entry._id,
      source: 'entry-automation',
    });
    expect(store.appointments.find((item) => sameId(item._id, userEditedAppointment._id))).toEqual(userEditedAppointment);
    expect(store.importantEvents).toEqual([manualImportantEvent]);
  });

  it('preserves calendar artifact IDs for metadata-only updates', async () => {
    const entryRes = await request(app)
      .post('/api/entries')
      .send({
        date: '2026-06-08',
        text: "I have a doctor's appointment at 3pm on June 25th.",
      });

    expect(entryRes.status).toBe(201);
    const entry = store.entries[0];
    const appointment = store.appointments[0];
    const manualEvent = {
      _id: new ObjectId(),
      userId,
      entryId: entry._id,
      title: 'Manual event',
      date: '2026-06-26',
      source: 'manual',
    };
    store.importantEvents.push(manualEvent);

    const updateRes = await request(app)
      .patch(`/api/entries/${entry._id}`)
      .send({
        mood: 'calm',
        tags: ['health'],
        pinned: true,
        cluster: 'Health',
        clusters: [new ObjectId().toString()],
        section: 'Appointments',
        sectionId: new ObjectId().toString(),
        sectionPageId: new ObjectId().toString(),
        linkedGoal: new ObjectId().toString(),
      });

    expect(updateRes.status).toBe(200);
    expect(store.appointments).toEqual([appointment]);
    expect(store.importantEvents).toEqual([manualEvent]);
  });

  it('does not duplicate an important event when the same entry text is saved again', async () => {
    const text = "Mom's birthday is on June 25th.";
    const entryRes = await request(app)
      .post('/api/entries')
      .send({ date: '2026-06-08', text });

    expect(entryRes.status).toBe(201);
    const entry = store.entries[0];
    expect(store.importantEvents).toHaveLength(1);
    expect(store.importantEvents[0]).toMatchObject({
      title: "Mom's birthday is",
      date: '2026-06-25',
      entryId: entry._id,
      source: 'entry-automation',
    });

    const updateRes = await request(app)
      .patch(`/api/entries/${entry._id}`)
      .send({ text });

    expect(updateRes.status).toBe(200);
    expect(store.importantEvents).toHaveLength(1);
    expect(store.importantEvents[0]).toMatchObject({
      title: "Mom's birthday is",
      date: '2026-06-25',
      entryId: entry._id,
      source: 'entry-automation',
    });
  });

  it('remembers a dismissed calendar inference across a related source edit', async () => {
    const text = "Mom's birthday is on June 25th.";
    const entryRes = await request(app)
      .post('/api/entries')
      .send({ date: '2026-06-08', text });

    expect(entryRes.status).toBe(201);
    const entry = store.entries[0];
    store.importantEvents[0].automationReviewStatus = 'dismissed';

    const updateRes = await request(app)
      .patch(`/api/entries/${entry._id}`)
      .send({ text: `${text} I may send a card.` });

    expect(updateRes.status).toBe(200);
    expect(store.importantEvents).toHaveLength(1);
    expect(store.importantEvents[0]).toMatchObject({
      entryId: entry._id,
      source: 'entry-automation',
      automationReviewStatus: 'dismissed',
    });
  });

  it('does not let a dismissed inference suppress different source content on the same date', async () => {
    const entryRes = await request(app)
      .post('/api/entries')
      .send({ date: '2026-06-08', text: "Mom's birthday is on June 25th." });

    expect(entryRes.status).toBe(201);
    const entry = store.entries[0];
    store.importantEvents[0].automationReviewStatus = 'dismissed';

    const updateRes = await request(app)
      .patch(`/api/entries/${entry._id}`)
      .send({ text: "Dad's birthday is on June 25th." });

    expect(updateRes.status).toBe(200);
    expect(store.importantEvents).toHaveLength(2);
    expect(store.importantEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ title: "Mom's birthday is", automationReviewStatus: 'dismissed' }),
      expect.objectContaining({ title: "Dad's birthday is", automationReviewStatus: 'pending' }),
    ]));
  });

  it('replaces an automation-created important event when entry text changes', async () => {
    const entryRes = await request(app)
      .post('/api/entries')
      .send({
        date: '2026-06-08',
        text: "Mom's birthday is on June 25th.",
      });

    expect(entryRes.status).toBe(201);
    const entry = store.entries[0];
    expect(store.importantEvents).toHaveLength(1);

    const updateRes = await request(app)
      .patch(`/api/entries/${entry._id}`)
      .send({ text: "Dad's birthday is on June 26th." });

    expect(updateRes.status).toBe(200);
    expect(store.importantEvents).toHaveLength(1);
    expect(store.importantEvents[0]).toMatchObject({
      title: "Dad's birthday is",
      date: '2026-06-26',
      entryId: entry._id,
      source: 'entry-automation',
    });
  });

  it('creates a linked important event from a dated personal visit plan', async () => {
    const entryRes = await request(app)
      .post('/api/entries')
      .send({
        date: '2026-07-08',
        text: visitMomText,
      });

    expect(entryRes.status).toBe(201);
    const entry = store.entries[0];
    expect(store.appointments).toHaveLength(0);
    expect(store.importantEvents).toHaveLength(1);
    expect(store.importantEvents[0]).toMatchObject({
      date: '2026-07-13',
      entryId: entry._id,
      source: 'entry-automation',
    });
    expect(store.importantEvents[0].title.toLowerCase()).toContain('visit');
    expect(store.importantEvents[0].title.toLowerCase()).toContain('mom');
  });

  it('regenerates only date-dependent calendar output when the entry date changes', async () => {
    const entryRes = await request(app)
      .post('/api/entries')
      .send({
        date: '2026-07-08',
        text: visitMomText,
      });

    expect(entryRes.status).toBe(201);
    const entry = store.entries[0];
    const originalEventId = String(store.importantEvents[0]._id);
    expect(store.importantEvents[0].date).toBe('2026-07-13');

    const updateRes = await request(app)
      .patch(`/api/entries/${entry._id}`)
      .send({ date: '2026-07-14' });

    expect(updateRes.status).toBe(200);
    expect(store.importantEvents).toHaveLength(1);
    expect(String(store.importantEvents[0]._id)).not.toBe(originalEventId);
    expect(store.importantEvents[0]).toMatchObject({
      date: '2026-08-13',
      entryId: entry._id,
      source: 'entry-automation',
    });
  });

  it('creates one grouped schedule suggestion without prematurely creating appointments', async () => {
    const response = await request(app)
      .post('/api/entries')
      .send({
        date: '2026-07-19',
        text: 'My schedule was released. I work Monday 10–3, Wednesday 12–8, and Friday 7:50–1:50.',
      });

    expect(response.status).toBe(201);
    expect(store.appointments).toHaveLength(0);
    expect(store.schedules).toHaveLength(1);
    expect(store.schedules[0]).toMatchObject({
      label: 'Work',
      mode: 'capture',
      periodStart: '2026-07-20',
      periodEnd: '2026-07-26',
      status: 'pending',
    });
    expect(store.schedules[0].changes).toHaveLength(3);
    expect(store.schedules[0].changes.every((change) => change.action === 'add')).toBe(true);
  });

  it('re-resolves a pending schedule after an entry-date edit', async () => {
    const response = await request(app)
      .post('/api/entries')
      .send({
        date: '2026-07-19',
        text: 'Next week I work Monday 10–3 and Wednesday noon–8.',
      });
    const entry = store.entries[0];
    expect(response.status).toBe(201);
    expect(store.schedules[0].changes[0].date).toBe('2026-07-20');

    const update = await request(app)
      .patch(`/api/entries/${entry._id}`)
      .send({ date: '2026-07-21' });

    expect(update.status).toBe(200);
    expect(store.schedules).toHaveLength(1);
    expect(store.schedules[0].automationRevision).toBe(2);
    expect(store.schedules[0].changes[0].date).toBe('2026-07-27');
  });

  it('does not churn schedule suggestions on metadata-only edits', async () => {
    await request(app)
      .post('/api/entries')
      .send({
        date: '2026-07-19',
        text: 'My schedule was released. I work Monday 10–3 and Friday 7:50–1:50.',
      });
    const entry = store.entries[0];
    const suggestionId = String(store.schedules[0]._id);

    const update = await request(app)
      .patch(`/api/entries/${entry._id}`)
      .send({ mood: 'hopeful', pinned: true, tags: ['work'] });

    expect(update.status).toBe(200);
    expect(store.schedules).toHaveLength(1);
    expect(String(store.schedules[0]._id)).toBe(suggestionId);
  });

  it('does not duplicate accepted shifts when equivalent schedule text is edited', async () => {
    const text = 'My schedule was released. I work Monday 10–3 and Friday 7:50–1:50.';
    await request(app).post('/api/entries').send({ date: '2026-07-19', text });
    const entry = store.entries[0];
    const accepted = store.schedules[0];
    accepted.status = 'accepted';
    for (const [index, proposed] of accepted.changes.entries()) {
      store.appointments.push({
        _id: new ObjectId(),
        userId,
        title: 'Work',
        scheduleLabel: 'Work',
        scheduleStatus: 'active',
        scheduleGroupId: accepted.scheduleGroupId,
        date: proposed.date,
        timeStart: proposed.start,
        timeEnd: proposed.end,
        entryId: entry._id,
        source: 'entry-automation',
        automationReviewStatus: 'kept',
        order: index,
      });
    }

    const update = await request(app)
      .patch(`/api/entries/${entry._id}`)
      .send({ text: `${text} That is the whole week.` });

    expect(update.status).toBe(200);
    expect(store.schedules).toHaveLength(1);
    expect(store.schedules[0].status).toBe('accepted');
    expect(store.appointments).toHaveLength(2);
  });
});
