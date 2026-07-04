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
    modelName: 'Ripple',
  },
}));

vi.mock('../../models/SuggestedTask.js', () => ({
  default: {
    deleteMany: (...args) => mocks.suggestedTaskDeleteMany(...args),
    insertMany: (...args) => mocks.suggestedTaskInsertMany(...args),
    modelName: 'SuggestedTask',
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

describe('entry automation task extraction', () => {
  beforeEach(() => {
    vi.clearAllMocks();

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
    mocks.rippleInsertMany.mockImplementation(async (docs) => docs.map((doc, index) => ({
      _id: `ripple-${index + 1}`,
      ...doc,
    })));
    mocks.suggestedTaskInsertMany.mockResolvedValue([]);
    mocks.taskInsertMany.mockResolvedValue([]);
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
    mocks.suggestedInterestFind.mockReturnValue({
      select: () => ({
        lean: () => Promise.resolve([]),
      }),
    });
    mocks.interestFind.mockReturnValue({
      select: () => ({
        lean: () => Promise.resolve([]),
      }),
    });
    mocks.suggestedInterestInsertMany.mockResolvedValue([]);
    mocks.importantEventFindOne.mockResolvedValue(null);
    mocks.importantEventCreate.mockResolvedValue(null);
    mocks.appointmentFindOne.mockResolvedValue(null);
    mocks.appointmentCreate.mockResolvedValue(null);
  });

  async function createEntry(text) {
    return createEntryWithAutomation({
      userId: 'user-1',
      payload: {
        date: '2026-06-08',
        text,
      },
    });
  }

  function insertedSuggestedTasks() {
    return mocks.suggestedTaskInsertMany.mock.calls.flatMap(([docs]) => docs);
  }

  it('stages a clean dated task suggestion without creating an active task', async () => {
    await createEntry('pay the daycare fees by the end of the day today');

    expect(insertedSuggestedTasks()[0]).toMatchObject({
      title: 'Pay daycare fees',
      dueDate: expect.any(Date),
    });
    expect(mocks.taskInsertMany).not.toHaveBeenCalled();
    expect(mocks.importantEventCreate).not.toHaveBeenCalled();
    expect(mocks.appointmentCreate).not.toHaveBeenCalled();
    expect(mocks.suggestedGatherItemInsertMany).not.toHaveBeenCalled();
    expect(mocks.suggestedInterestInsertMany).not.toHaveBeenCalled();
  });

  it('keeps undated task candidates review-first instead of active daily tasks', async () => {
    await createEntry('I really gotta finish folding the laundry, but signing up for volunteering sounds soft.');

    expect(insertedSuggestedTasks()[0]).toMatchObject({
      title: 'Finish folding the laundry',
    });
    expect(mocks.taskInsertMany).not.toHaveBeenCalled();
  });

  it('keeps recurring habit-like task candidates review-first', async () => {
    await createEntry('remember to clean the fish tank every other day');

    expect(insertedSuggestedTasks()[0]).toMatchObject({
      title: 'Clean the fish tank',
      repeat: 'FREQ=DAILY;INTERVAL=2',
    });
    expect(mocks.taskInsertMany).not.toHaveBeenCalled();
  });

  it('stages a future dated task suggestion without creating Gather or ImportantEvent records', async () => {
    await createEntry('I need to remember to extend the pause on my Audible subscription in two months.');

    expect(insertedSuggestedTasks()[0]).toMatchObject({
      title: 'Extend the pause on my Audible subscription',
      dueDate: expect.any(Date),
    });
    expect(mocks.taskInsertMany).not.toHaveBeenCalled();
    expect(mocks.suggestedGatherItemInsertMany).not.toHaveBeenCalled();
    expect(mocks.importantEventCreate).not.toHaveBeenCalled();
  });

  it('does not create active tasks for soft should phrases or short imperatives', async () => {
    await createEntry('I should sign up for volunteering at the humane society');
    await createEntry('pick up iron');

    expect(mocks.suggestedTaskInsertMany).not.toHaveBeenCalled();
    expect(mocks.taskInsertMany).not.toHaveBeenCalled();
  });

  it('extracts a clean today task from need-to action language without creating an ImportantEvent', async () => {
    await createEntry('I really need to tidy up the apartment today; grab a couple of garbage bags and just go at');

    expect(insertedSuggestedTasks()[0]).toMatchObject({
      title: 'Tidy up the apartment',
      dueDate: expect.any(Date),
    });
    expect(mocks.taskInsertMany).not.toHaveBeenCalled();
    expect(mocks.importantEventCreate).not.toHaveBeenCalled();
  });
});
