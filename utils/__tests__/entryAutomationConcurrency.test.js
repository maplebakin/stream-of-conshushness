import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  entry: null,
  version: 0,
  appointmentDeletes: [],
  gatherDeletes: [],
  firstCalendarDeleteStarted: null,
  signalFirstCalendarDelete: null,
  releaseFirstCalendarDelete: null,
  firstCalendarDeleteGate: null,
  blockedOnce: false,
  ripples: [],
  suggestions: [],
  rippleDeletes: [],
}));

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function snapshotEntry() {
  if (!state.entry) return null;
  const snapshotVersion = state.version;
  return {
    ...state.entry,
    clusters: [...(state.entry.clusters || [])],
    tags: [...(state.entry.tags || [])],
    suggestedTasks: [...(state.entry.suggestedTasks || [])],
    save: vi.fn(async function save() {
      if (snapshotVersion !== state.version) {
        const error = new Error('concurrent entry update');
        error.name = 'VersionError';
        throw error;
      }
      const { save: _save, ...persisted } = this;
      state.entry = { ...persisted };
      state.version += 1;
      return this;
    }),
  };
}

function emptySelectLean() {
  return {
    select: () => ({ lean: async () => [] }),
  };
}

vi.mock('../../models/Entry.js', () => ({
  default: {
    findOne: vi.fn(async (query) => (
      String(query._id) === String(state.entry?._id) && String(query.userId) === String(state.entry?.userId)
        ? snapshotEntry()
        : null
    )),
    findOneAndUpdate: vi.fn(async (query, update) => {
      if (
        String(query._id) !== String(state.entry?._id) ||
        String(query.userId) !== String(state.entry?.userId) ||
        query.automationRevision !== state.entry?.automationRevision
      ) return null;
      Object.assign(state.entry, update.$set || {});
      return snapshotEntry();
    }),
  },
}));

vi.mock('../../models/Appointment.js', () => ({
  default: {
    findOne: vi.fn(async () => null),
    create: vi.fn(async (doc) => doc),
    deleteMany: vi.fn(async (query) => {
      state.appointmentDeletes.push(query);
      if (!state.blockedOnce) {
        state.blockedOnce = true;
        state.signalFirstCalendarDelete();
        await state.firstCalendarDeleteGate;
      }
      return { deletedCount: 0 };
    }),
  },
}));

vi.mock('../../models/ImportantEvent.js', () => ({
  default: {
    findOne: vi.fn(async () => null),
    create: vi.fn(async (doc) => doc),
    deleteMany: vi.fn(async () => ({ deletedCount: 0 })),
  },
}));

vi.mock('../../models/Ripple.js', () => ({
  default: {
    find: vi.fn((query) => ({
      select: () => ({
        lean: async () => state.ripples.filter((item) => (
          String(item.userId) === String(query.userId)
          && String(item.entryId) === String(query.entryId)
          && (!query.status || item.status === query.status)
        )),
      }),
    })),
    deleteMany: vi.fn(async (query) => {
      state.rippleDeletes.push(query);
      return { deletedCount: 0 };
    }),
    insertMany: vi.fn(async () => []),
    modelName: 'Ripple',
  },
}));

vi.mock('../../models/SuggestedTask.js', () => ({
  default: {
    find: vi.fn((query) => ({
      select: () => ({
        lean: async () => state.suggestions.filter((item) => (
          String(item.userId) === String(query.userId)
          && (query.sourceRippleId?.$in || []).some((id) => String(id) === String(item.sourceRippleId))
          && (!query.status?.$in || query.status.$in.includes(item.status))
        )),
      }),
    })),
    deleteMany: vi.fn(async () => ({ deletedCount: 0 })),
    insertMany: vi.fn(async () => []),
    modelName: 'SuggestedTask',
  },
}));

vi.mock('../../models/SuggestedGatherItem.js', () => ({
  default: {
    find: vi.fn(() => emptySelectLean()),
    deleteMany: vi.fn(async (query) => {
      state.gatherDeletes.push(query);
      return { deletedCount: 0 };
    }),
    insertMany: vi.fn(async () => []),
    modelName: 'SuggestedGatherItem',
  },
}));

vi.mock('../../models/GatherItem.js', () => ({
  default: { find: vi.fn(() => emptySelectLean()), modelName: 'GatherItem' },
}));

vi.mock('../../models/SuggestedInterest.js', () => ({
  default: {
    find: vi.fn(() => emptySelectLean()),
    deleteMany: vi.fn(async () => ({ deletedCount: 0 })),
    insertMany: vi.fn(async () => []),
    modelName: 'SuggestedInterest',
  },
}));

vi.mock('../../models/Interest.js', () => ({
  default: { find: vi.fn(() => emptySelectLean()), modelName: 'Interest' },
}));

vi.mock('../../models/Cluster.js', () => ({
  default: { find: vi.fn(() => emptySelectLean()) },
}));

vi.mock('../../models/Task.js', () => ({
  default: { insertMany: vi.fn(async () => []), modelName: 'Task' },
}));

vi.mock('../analyzeEntry.js', () => ({ default: () => null }));
vi.mock('../rippleExtractor.js', () => ({
  extractEntrySuggestions: () => [],
  extractRipplesFromEntry: () => ({ ripples: [] }),
}));
vi.mock('../gatherExtractor.js', () => ({
  extractGatherItems: () => [],
  hasScheduledActionSignal: () => false,
  normalizeGatherTitleKey: (value) => String(value || '').toLowerCase(),
}));
vi.mock('../interestExtractor.js', () => ({
  extractInterests: () => [],
  normalizeInterestTitleKey: (value) => String(value || '').toLowerCase(),
}));
vi.mock('../ownedReferences.js', () => ({
  resolveOwnedGoalId: async (_userId, value) => value || null,
  resolveOwnedSectionId: async (_userId, value) => value || null,
  resolveOwnedSectionPageId: async (_userId, value) => value || null,
}));

const { clearRippleArtifacts, updateEntryWithAutomation } = await import('../entryAutomation.js');

describe('entry automation source revisions', () => {
  beforeEach(() => {
    const started = deferred();
    const gate = deferred();
    state.entry = {
      _id: 'entry-1',
      userId: 'user-1',
      date: '2026-07-13',
      text: 'Original thought',
      html: '',
      content: '',
      mood: '',
      tags: [],
      cluster: '',
      clusters: [],
      section: '',
      sectionId: null,
      sectionPageId: null,
      linkedGoal: null,
      pinned: false,
      suggestedTasks: [],
      automationPending: false,
      automationRevision: 1,
    };
    state.version = 1;
    state.appointmentDeletes = [];
    state.gatherDeletes = [];
    state.firstCalendarDeleteStarted = started.promise;
    state.signalFirstCalendarDelete = started.resolve;
    state.firstCalendarDeleteGate = gate.promise;
    state.releaseFirstCalendarDelete = gate.resolve;
    state.blockedOnce = false;
    state.ripples = [];
    state.suggestions = [];
    state.rippleDeletes = [];
  });

  it('lets a newer edit win while an older automation run is still in flight', async () => {
    const olderRun = updateEntryWithAutomation({
      userId: 'user-1',
      entryId: 'entry-1',
      updates: { text: 'First edited thought' },
    });

    await state.firstCalendarDeleteStarted;

    const newerResult = await updateEntryWithAutomation({
      userId: 'user-1',
      entryId: 'entry-1',
      updates: { text: 'Newest edited thought' },
    });

    state.releaseFirstCalendarDelete();
    const olderResult = await olderRun;

    expect(state.entry).toMatchObject({
      text: 'Newest edited thought',
      automationPending: false,
      automationRevision: 3,
    });
    expect(newerResult).toMatchObject({ text: 'Newest edited thought', automationRevision: 3 });
    expect(olderResult).toMatchObject({ text: 'Newest edited thought', automationRevision: 3 });
    expect(state.appointmentDeletes).toContainEqual(expect.objectContaining({ automationRevision: 2 }));
    expect(state.gatherDeletes).toContainEqual(expect.objectContaining({ automationRevision: 2 }));
    expect(state.appointmentDeletes).not.toContainEqual(expect.objectContaining({ automationRevision: 3 }));
  });

  it('does not delete a pending ripple after acceptance has claimed its suggestion', async () => {
    state.ripples = [{
      _id: 'ripple-1',
      userId: 'user-1',
      entryId: 'entry-1',
      status: 'pending',
      automationRevision: 2,
    }];
    state.suggestions = [{
      _id: 'suggestion-1',
      userId: 'user-1',
      sourceRippleId: 'ripple-1',
      status: 'accepting',
    }];

    await clearRippleArtifacts({
      userId: 'user-1',
      entryId: 'entry-1',
      exactRevision: 2,
    });

    expect(state.rippleDeletes).toEqual([]);
  });
});
