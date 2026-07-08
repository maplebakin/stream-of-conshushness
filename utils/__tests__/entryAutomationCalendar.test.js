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
const { __testables } = await import('../entryAutomation.js');

const visitMomText = "I'm going to visit my mom on the 13th! It'll be the first time I've visited as really myself and not as a mom since I've had Colton, I'm really looking forward to it.";

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

  async function createEntry(text, date = '2026-06-08') {
    return createEntryWithAutomation({
      userId: 'user-1',
      payload: {
        date,
        text,
      },
    });
  }

  it('resolves standalone ordinal dates against the entry date', () => {
    expect(__testables.resolveOrdinalDayDate(13, '2026-07-08')).toBe('2026-07-13');
    expect(__testables.resolveOrdinalDayDate(13, '2026-07-13')).toBe('2026-07-13');
    expect(__testables.resolveOrdinalDayDate(13, '2026-07-14')).toBe('2026-08-13');
  });

  it('parses a dated personal visit plan into a clean important event candidate', () => {
    const parsed = __testables.parseAppointmentsFromText(visitMomText, '2026-07-08');

    expect(parsed.appointments).toEqual([]);
    expect(parsed.importantEvents).toHaveLength(1);
    expect(parsed.importantEvents[0]).toMatchObject({
      title: 'Visit my mom',
      date: '2026-07-13',
    });
  });

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

  it('creates a linked important event from a dated personal visit plan', async () => {
    const entry = await createEntry(visitMomText, '2026-07-08');

    expect(entry).toMatchObject({
      _id: 'entry-1',
      text: visitMomText,
    });
    expect(mocks.importantEventCreate).toHaveBeenCalledTimes(1);
    expect(mocks.importantEventCreate).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      title: 'Visit my mom',
      date: '2026-07-13',
      entryId: 'entry-1',
      source: 'entry-automation',
    }));
    expect(mocks.appointmentCreate).not.toHaveBeenCalled();
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
