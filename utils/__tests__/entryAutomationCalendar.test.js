import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  entryCreate: vi.fn(),
  importantEventFindOne: vi.fn(),
  importantEventCreate: vi.fn(),
  appointmentFindOne: vi.fn(),
  appointmentCreate: vi.fn(),
  rippleFind: vi.fn(),
  rippleInsertMany: vi.fn(),
  suggestedTaskInsertMany: vi.fn(),
  suggestedGatherItemFind: vi.fn(),
  suggestedGatherItemInsertMany: vi.fn(),
  gatherItemFind: vi.fn(),
  taskInsertMany: vi.fn(),
  clusterFind: vi.fn(),
}));

vi.mock('../analyzeEntry.js', () => ({
  default: () => null,
}));

vi.mock('../rippleExtractor.js', () => ({
  extractEntrySuggestions: () => [],
  extractRipplesFromEntry: () => ({ ripples: [] }),
}));

vi.mock('../../models/Entry.js', () => ({
  default: {
    create: (...args) => mocks.entryCreate(...args),
    findOne: vi.fn(),
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
    deleteMany: vi.fn(),
    insertMany: (...args) => mocks.rippleInsertMany(...args),
  },
}));

vi.mock('../../models/SuggestedTask.js', () => ({
  default: {
    deleteMany: vi.fn(),
    insertMany: (...args) => mocks.suggestedTaskInsertMany(...args),
  },
}));

vi.mock('../../models/SuggestedGatherItem.js', () => ({
  default: {
    deleteMany: vi.fn(),
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

describe('entry automation calendar extraction', () => {
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
    mocks.taskInsertMany.mockResolvedValue([]);
    mocks.importantEventFindOne.mockResolvedValue(null);
    mocks.importantEventCreate.mockResolvedValue(null);
    mocks.appointmentFindOne.mockResolvedValue(null);
    mocks.appointmentCreate.mockImplementation(async (doc) => ({ _id: 'appointment-1', ...doc }));
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

  it('creates a linked appointment from a high-confidence dated appointment entry', async () => {
    const entry = await createEntry("I have a doctor's appointment at 3pm on June 25th.");

    expect(entry).toMatchObject({
      _id: 'entry-1',
      text: "I have a doctor's appointment at 3pm on June 25th.",
    });
    expect(mocks.appointmentCreate).toHaveBeenCalledTimes(1);
    expect(mocks.appointmentCreate).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      title: "Doctor's appointment",
      date: '2026-06-25',
      timeStart: '15:00',
      entryId: 'entry-1',
    }));
    expect(mocks.suggestedGatherItemInsertMany).not.toHaveBeenCalled();
    expect(mocks.taskInsertMany).not.toHaveBeenCalled();
  });

  it.each([
    'I should book a doctor appointment.',
    "I'm nervous about my appointment.",
    'Doctor said follow up in two weeks.',
  ])('does not directly create an appointment for ambiguous entry: %s', async (text) => {
    await createEntry(text);

    expect(mocks.appointmentCreate).not.toHaveBeenCalled();
  });
});
