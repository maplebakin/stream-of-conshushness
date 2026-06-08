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
  suggestedGatherItemInsertMany: vi.fn(),
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
    insertMany: (...args) => mocks.suggestedGatherItemInsertMany(...args),
    modelName: 'SuggestedGatherItem',
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
    mocks.suggestedGatherItemInsertMany.mockImplementation(async (docs) => docs);
    mocks.taskInsertMany.mockResolvedValue([]);
    mocks.importantEventFindOne.mockResolvedValue(null);
    mocks.importantEventCreate.mockResolvedValue(null);
    mocks.appointmentFindOne.mockResolvedValue(null);
    mocks.appointmentCreate.mockResolvedValue(null);
  });

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
});
