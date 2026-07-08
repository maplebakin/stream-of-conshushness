import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';

const store = vi.hoisted(() => ({
  entries: [],
  appointments: [],
  importantEvents: [],
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

function matchesCalendarQuery(item, query) {
  return (
    sameId(item.userId, query.userId) &&
    (!query.entryId || sameId(item.entryId, query.entryId)) &&
    (!query.source || item.source === query.source) &&
    (!query.title || item.title === query.title) &&
    (!query.date || item.date === query.date) &&
    (!query.timeStart || item.timeStart === query.timeStart)
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
    findOne: vi.fn(() => ({
      select: () => ({
        lean: async () => null,
      }),
    })),
  },
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

    const updateRes = await request(app)
      .patch(`/api/entries/${entry._id}`)
      .send({ text: 'I have a dentist appointment at 4pm on June 26th.' });

    expect(updateRes.status).toBe(200);
    expect(store.appointments).toHaveLength(1);
    expect(store.appointments[0]).toMatchObject({
      title: 'Dentist appointment',
      date: '2026-06-26',
      timeStart: '16:00',
      entryId: entry._id,
      source: 'entry-automation',
    });
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
});
