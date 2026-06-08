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
  suggestedInterestDeleteMany: vi.fn(),
  suggestedInterestFind: vi.fn(),
  suggestedInterestInsertMany: vi.fn(),
  interestFind: vi.fn(),
  taskInsertMany: vi.fn(),
  clusterFind: vi.fn(),
  existingSuggestedInterests: [],
  existingInterests: [],
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

vi.mock('../../models/SuggestedInterest.js', () => ({
  default: {
    deleteMany: (...args) => mocks.suggestedInterestDeleteMany(...args),
    find: (...args) => mocks.suggestedInterestFind(...args),
    insertMany: (...args) => mocks.suggestedInterestInsertMany(...args),
    modelName: 'SuggestedInterest',
  },
}));

vi.mock('../../models/Interest.js', () => ({
  default: {
    find: (...args) => mocks.interestFind(...args),
    modelName: 'Interest',
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

describe('entry automation interest suggestions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.existingSuggestedInterests = [];
    mocks.existingInterests = [];

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
    mocks.suggestedGatherItemFind.mockReturnValue({
      select: () => ({
        lean: () => Promise.resolve([]),
      }),
    });
    mocks.gatherItemFind.mockReturnValue({
      select: () => ({
        lean: () => Promise.resolve([]),
      }),
    });
    mocks.suggestedGatherItemInsertMany.mockResolvedValue([]);
    mocks.suggestedInterestFind.mockImplementation((query) => ({
      select: () => ({
        lean: () => Promise.resolve(
          mocks.existingSuggestedInterests.filter((item) => (
            item.userId === query.userId &&
            item.category === query.category &&
            item.status === query.status
          ))
        ),
      }),
    }));
    mocks.interestFind.mockImplementation((query) => ({
      select: () => ({
        lean: () => Promise.resolve(
          mocks.existingInterests.filter((item) => {
            const statuses = query.status?.$in || [query.status];
            return (
              item.userId === query.userId &&
              item.category === query.category &&
              statuses.includes(item.status)
            );
          })
        ),
      }),
    }));
    mocks.suggestedInterestInsertMany.mockImplementation(async (docs) => {
      mocks.existingSuggestedInterests.push(...docs);
      return docs;
    });
    mocks.taskInsertMany.mockResolvedValue([]);
    mocks.importantEventFindOne.mockResolvedValue(null);
    mocks.importantEventCreate.mockResolvedValue(null);
    mocks.appointmentFindOne.mockResolvedValue(null);
    mocks.appointmentCreate.mockResolvedValue(null);
  });

  async function createInterestEntry(text) {
    return createEntryWithAutomation({
      userId: 'user-1',
      payload: {
        date: '2026-06-08',
        text,
      },
    });
  }

  function insertedInterestDocs() {
    return mocks.suggestedInterestInsertMany.mock.calls.flatMap(([docs]) => docs);
  }

  it('creates a pending SuggestedInterest for a soft interest entry without creating other objects', async () => {
    const entry = await createInterestEntry("I'd like to learn about tap dance.");

    expect(entry).toMatchObject({
      _id: 'entry-1',
      text: "I'd like to learn about tap dance.",
      suggestedTasks: [],
    });
    expect(mocks.suggestedInterestInsertMany).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          userId: 'user-1',
          title: 'Tap dance',
          normalizedTitle: 'tap dance',
          category: 'Learning Curiosities',
          status: 'pending',
          sourceEntryId: 'entry-1',
          sourceText: "I'd like to learn about tap dance.",
        }),
      ],
      { ordered: false }
    );
    expect(mocks.taskInsertMany).not.toHaveBeenCalled();
    expect(mocks.suggestedTaskInsertMany).not.toHaveBeenCalled();
    expect(mocks.suggestedGatherItemInsertMany).not.toHaveBeenCalled();
    expect(mocks.appointmentCreate).not.toHaveBeenCalled();
    expect(mocks.importantEventCreate).not.toHaveBeenCalled();
  });

  it('does not create duplicate suggestions when an active Interest already exists', async () => {
    mocks.existingInterests = [{
      userId: 'user-1',
      title: 'Tap dance',
      normalizedTitle: 'tap dance',
      category: 'Learning Curiosities',
      status: 'curious',
    }];

    await createInterestEntry("I'd like to learn about tap dance.");

    expect(mocks.suggestedInterestInsertMany).not.toHaveBeenCalled();
  });

  it('does not create duplicate suggestions when a pending SuggestedInterest already exists', async () => {
    mocks.existingSuggestedInterests = [{
      userId: 'user-1',
      title: 'Tap dance',
      normalizedTitle: 'tap dance',
      category: 'Learning Curiosities',
      status: 'pending',
    }];

    await createInterestEntry("I'd like to learn about tap dance.");

    expect(mocks.suggestedInterestInsertMany).not.toHaveBeenCalled();
  });

  it('allows a new suggestion when existing Interest is archived or previous suggestion was rejected', async () => {
    mocks.existingInterests = [{
      userId: 'user-1',
      title: 'Tap dance',
      normalizedTitle: 'tap dance',
      category: 'Learning Curiosities',
      status: 'archived',
    }];
    mocks.existingSuggestedInterests = [{
      userId: 'user-1',
      title: 'Tap dance',
      normalizedTitle: 'tap dance',
      category: 'Learning Curiosities',
      status: 'rejected',
    }];

    await createInterestEntry("I'd like to learn about tap dance.");

    expect(insertedInterestDocs()[0]).toMatchObject({
      title: 'Tap dance',
      category: 'Learning Curiosities',
      status: 'pending',
    });
  });

  it.each([
    'I want tap shoes.',
    'I want to buy a sourdough starter.',
    'I should sign up for a tap dance class tomorrow.',
  ])('does not create SuggestedInterest for conflict phrase: %s', async (text) => {
    await createInterestEntry(text);

    expect(mocks.suggestedInterestInsertMany).not.toHaveBeenCalled();
  });
});
