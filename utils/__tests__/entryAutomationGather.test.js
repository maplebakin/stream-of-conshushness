import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  entryCreate: vi.fn(),
  entryFindOne: vi.fn(),
  importantEventFindOne: vi.fn(),
  importantEventCreate: vi.fn(),
  appointmentFindOne: vi.fn(),
  appointmentCreate: vi.fn(),
  rippleFind: vi.fn(),
  rippleDeleteMany: vi.fn(),
  rippleInsertMany: vi.fn(),
  suggestedTaskDeleteMany: vi.fn(),
  suggestedTaskInsertMany: vi.fn(),
  suggestedGatherItemDeleteMany: vi.fn(),
  suggestedGatherItemFind: vi.fn(),
  suggestedGatherItemInsertMany: vi.fn(),
  gatherItemFind: vi.fn(),
  taskInsertMany: vi.fn(),
  clusterFind: vi.fn(),
  existingSuggestions: [],
  existingGatherItems: [],
}));

vi.mock('../../models/Entry.js', () => ({
  default: {
    create: (...args) => mocks.entryCreate(...args),
    findOne: (...args) => mocks.entryFindOne(...args),
  },
}));

vi.mock('../../models/ImportantEvent.js', () => ({
  default: {
    findOne: (...args) => mocks.importantEventFindOne(...args),
    create: (...args) => mocks.importantEventCreate(...args),
  },
}));

vi.mock('../../models/Appointment.js', () => ({
  default: {
    findOne: (...args) => mocks.appointmentFindOne(...args),
    create: (...args) => mocks.appointmentCreate(...args),
  },
}));

vi.mock('../../models/Ripple.js', () => ({
  default: {
    find: (...args) => mocks.rippleFind(...args),
    deleteMany: (...args) => mocks.rippleDeleteMany(...args),
    insertMany: (...args) => mocks.rippleInsertMany(...args),
  },
}));

vi.mock('../../models/SuggestedTask.js', () => ({
  default: {
    deleteMany: (...args) => mocks.suggestedTaskDeleteMany(...args),
    insertMany: (...args) => mocks.suggestedTaskInsertMany(...args),
  },
}));

vi.mock('../../models/SuggestedGatherItem.js', () => ({
  default: {
    deleteMany: (...args) => mocks.suggestedGatherItemDeleteMany(...args),
    find: (...args) => mocks.suggestedGatherItemFind(...args),
    insertMany: (...args) => mocks.suggestedGatherItemInsertMany(...args),
    modelName: 'SuggestedGatherItem',
  },
}));

vi.mock('../../models/GatherItem.js', () => ({
  default: {
    find: (...args) => mocks.gatherItemFind(...args),
    modelName: 'GatherItem',
  },
}));

vi.mock('../../models/Task.js', () => ({
  default: {
    insertMany: (...args) => mocks.taskInsertMany(...args),
    modelName: 'Task',
  },
}));

vi.mock('../../models/Cluster.js', () => ({
  default: {
    find: (...args) => mocks.clusterFind(...args),
  },
}));

const { createEntryWithAutomation } = await import('../entryAutomation.js');

describe('entry automation gather suggestions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.existingSuggestions = [];
    mocks.existingGatherItems = [];

    mocks.entryCreate.mockImplementation(async (doc) => ({
      _id: 'entry-1',
      ...doc,
      clusters: doc.clusters || [],
      save: vi.fn().mockResolvedValue(undefined),
    }));

    mocks.clusterFind.mockReturnValue({
      select: () => ({
        lean: () => Promise.resolve([]),
      }),
    });

    mocks.rippleFind.mockReturnValue({
      select: () => Promise.resolve([]),
    });
    mocks.rippleInsertMany.mockResolvedValue([]);
    mocks.suggestedTaskInsertMany.mockResolvedValue([]);
    mocks.suggestedGatherItemFind.mockImplementation((query) => ({
      select: () => ({
        lean: () => Promise.resolve(
          mocks.existingSuggestions.filter((item) => (
            item.userId === query.userId &&
            (!query.list || item.list === query.list) &&
            (!query.sourceEntryId || item.sourceEntryId === query.sourceEntryId) &&
            (query.status?.$in ? query.status.$in.includes(item.status) : item.status === query.status)
          ))
        ),
      }),
    }));
    mocks.gatherItemFind.mockImplementation((query) => ({
      select: () => ({
        lean: () => Promise.resolve(
          mocks.existingGatherItems.filter((item) => {
            const statuses = query.status?.$in || [query.status];
            return (
              item.userId === query.userId &&
              item.list === query.list &&
              statuses.includes(item.status)
            );
          })
        ),
      }),
    }));
    mocks.suggestedGatherItemInsertMany.mockImplementation(async (docs) => {
      mocks.existingSuggestions.push(...docs);
      return docs;
    });
    mocks.taskInsertMany.mockResolvedValue([]);
    mocks.importantEventFindOne.mockResolvedValue(null);
    mocks.importantEventCreate.mockResolvedValue(null);
    mocks.appointmentFindOne.mockResolvedValue(null);
    mocks.appointmentCreate.mockResolvedValue(null);
  });

  async function createGatherEntry(text) {
    return createEntryWithAutomation({
      userId: 'user-1',
      payload: {
        date: '2026-06-08',
        text,
      },
    });
  }

  function insertedGatherDocs() {
    return mocks.suggestedGatherItemInsertMany.mock.calls.flatMap(([docs]) => docs);
  }

  it('creates a pending SuggestedGatherItem for a gather-only entry without creating a task', async () => {
    const entry = await createEntryWithAutomation({
      userId: 'user-1',
      payload: {
        date: '2026-06-08',
        text: 'I need a container for my nail stuff.',
      },
    });

    expect(entry).toMatchObject({
      _id: 'entry-1',
      text: 'I need a container for my nail stuff.',
    });
    expect(mocks.entryCreate).toHaveBeenCalled();
    expect(mocks.suggestedGatherItemInsertMany).toHaveBeenCalledTimes(1);
    expect(mocks.suggestedGatherItemInsertMany).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          userId: 'user-1',
          title: 'Container for nail stuff',
          normalizedTitle: 'container for nail stuff',
          list: 'Needed Containers',
          status: 'pending',
          sourceEntryId: 'entry-1',
          sourceText: 'I need a container for my nail stuff.',
        }),
      ],
      { ordered: false }
    );
    expect(mocks.taskInsertMany).not.toHaveBeenCalled();
  });

  it('creates grocery suggestions without creating tasks', async () => {
    await createGatherEntry('I need to get milk');

    expect(insertedGatherDocs()[0]).toMatchObject({
      userId: 'user-1',
      title: 'Milk',
      normalizedTitle: 'milk',
      list: 'Grocery List',
      status: 'pending',
      sourceEntryId: 'entry-1',
      sourceText: 'I need to get milk',
    });
    expect(mocks.taskInsertMany).not.toHaveBeenCalled();
  });

  it('extracts grocery recall phrases from entries', async () => {
    const cases = [
      ['Colton wants Gatorade', 'Gatorade', 'Grocery List'],
      ["We're out of ketchup", 'Ketchup', 'Grocery List'],
      ['Need more cat litter', 'Cat litter', 'Pet Supplies'],
      ['Running low on laundry detergent', 'Laundry detergent', 'Home Supplies'],
    ];

    for (const [text, title, list] of cases) {
      vi.clearAllMocks();
      mocks.existingSuggestions = [];
      mocks.existingGatherItems = [];
      mocks.suggestedGatherItemInsertMany.mockImplementation(async (docs) => {
        mocks.existingSuggestions.push(...docs);
        return docs;
      });

      const entry = await createGatherEntry(text);
      const doc = insertedGatherDocs()[0];

      expect(entry).toMatchObject({ _id: 'entry-1', text });
      expect(doc).toMatchObject({
        title,
        list,
        status: 'pending',
        sourceEntryId: 'entry-1',
        sourceText: text,
      });
      if (text.includes('Colton')) {
        expect(doc.tags).toContain('colton');
      }
      expect(mocks.taskInsertMany).not.toHaveBeenCalled();
    }
  });

  it('does not create duplicate suggestions when a pending suggestion already exists', async () => {
    mocks.existingSuggestions = [{
      userId: 'user-1',
      title: 'Milk',
      normalizedTitle: 'milk',
      list: 'Grocery List',
      status: 'pending',
    }];

    const entry = await createGatherEntry('I need to get milk');

    expect(entry).toMatchObject({ _id: 'entry-1' });
    expect(mocks.suggestedGatherItemInsertMany).not.toHaveBeenCalled();
  });

  it('does not revive a rejected suggestion from the same source entry', async () => {
    mocks.existingSuggestions = [{
      userId: 'user-1',
      sourceEntryId: 'entry-1',
      title: 'Milk',
      normalizedTitle: 'milk',
      list: 'Grocery List',
      status: 'rejected',
    }];

    await createGatherEntry('I need to get milk');

    expect(mocks.suggestedGatherItemInsertMany).not.toHaveBeenCalled();
  });

  it('does not create duplicate suggestions when an active GatherItem already exists', async () => {
    mocks.existingGatherItems = [{
      userId: 'user-1',
      title: 'Milk',
      normalizedTitle: 'milk',
      list: 'Grocery List',
      status: 'needed',
    }];

    const entry = await createGatherEntry('I need to get milk');

    expect(entry).toMatchObject({ _id: 'entry-1' });
    expect(mocks.suggestedGatherItemInsertMany).not.toHaveBeenCalled();
  });

  it('allows a new suggestion when an existing GatherItem is bought', async () => {
    mocks.existingGatherItems = [{
      userId: 'user-1',
      title: 'Milk',
      normalizedTitle: 'milk',
      list: 'Grocery List',
      status: 'bought',
    }];

    await createGatherEntry('I need to get milk');

    expect(insertedGatherDocs()[0]).toMatchObject({
      title: 'Milk',
      list: 'Grocery List',
      status: 'pending',
    });
  });

  it('does not duplicate a Gather suggestion for a scheduled action when the item is already active', async () => {
    mocks.existingGatherItems = [{
      userId: 'user-1',
      title: 'Milk',
      normalizedTitle: 'milk',
      list: 'Grocery List',
      status: 'needed',
    }];

    const entry = await createGatherEntry("I need to get milk tomorrow while I'm at work");

    expect(entry).toMatchObject({ _id: 'entry-1' });
    expect(mocks.suggestedGatherItemInsertMany).not.toHaveBeenCalled();
  });
});
