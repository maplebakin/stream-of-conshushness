import { beforeEach, describe, expect, it, vi } from 'vitest';

const makeAsyncCursor = async function* (docs) {
  for (const doc of docs) yield doc;
};

function makeQuery(docs) {
  const sortDocs = (sortSpec) => {
    if (!sortSpec || sortSpec.date !== -1) return docs;
    return [...docs].sort((a, b) => {
      const aTime = new Date(a.date || 0).getTime();
      const bTime = new Date(b.date || 0).getTime();
      return bTime - aTime;
    });
  };

  const query = {
    _docs: docs,
    sort: vi.fn((sortSpec) => {
      query._docs = sortDocs(sortSpec);
      return query;
    }),
    select: vi.fn(() => query),
    populate: vi.fn(() => query),
    limit: vi.fn(() => query),
    lean: vi.fn(() => query),
    cursor: vi.fn(() => makeAsyncCursor(query._docs)),
    then: (resolve, reject) => Promise.resolve(query._docs).then(resolve, reject),
  };
  return query;
}

function matchesActiveFilter(query) {
  return query?.deletedAt === null;
}

const fixtures = vi.hoisted(() => ({
  entries: [
    { _id: 'entry-active-1', date: '2026-06-29', text: 'Alpha active', deletedAt: null },
    { _id: 'entry-active-2', date: '2026-06-30', text: 'Alpha missing deletedAt' },
    { _id: 'entry-trash-1', date: '2026-06-28', text: 'Alpha trashed', deletedAt: new Date('2026-06-30T12:00:00Z') },
  ],
  taskDocs: [
    { _id: 'task-1', title: 'Alpha task', notes: 'Alpha task note', completed: false },
  ],
  goalDocs: [],
  noteDocs: [],
  sectionDocs: [],
  sectionPageDocs: [],
  clusterDocs: [],
  appointmentDocs: [],
  importantEventDocs: [],
  gatherItemDocs: [],
  suggestedGatherItemDocs: [],
  interestDocs: [],
  suggestedInterestDocs: [],
  suggestedTaskDocs: [],
  habitDocs: [],
  researchSubjectDocs: [],
  gameDocs: [],
  gameNoteDocs: [],
  scheduleItemDocs: [],
}));

const entryFindMock = vi.fn((query = {}) => makeQuery(matchesActiveFilter(query) ? fixtures.entries.filter((entry) => entry.deletedAt == null) : fixtures.entries));
const taskFindMock = vi.fn(() => makeQuery(fixtures.taskDocs));
const goalFindMock = vi.fn(() => makeQuery(fixtures.goalDocs));
const noteFindMock = vi.fn(() => makeQuery(fixtures.noteDocs));
const sectionFindMock = vi.fn(() => makeQuery(fixtures.sectionDocs));
const sectionPageFindMock = vi.fn(() => makeQuery(fixtures.sectionPageDocs));
const clusterFindMock = vi.fn(() => makeQuery(fixtures.clusterDocs));
const appointmentFindMock = vi.fn(() => makeQuery(fixtures.appointmentDocs));
const importantEventFindMock = vi.fn(() => makeQuery(fixtures.importantEventDocs));
const gatherItemFindMock = vi.fn(() => makeQuery(fixtures.gatherItemDocs));
const suggestedGatherItemFindMock = vi.fn(() => makeQuery(fixtures.suggestedGatherItemDocs));
const interestFindMock = vi.fn(() => makeQuery(fixtures.interestDocs));
const suggestedInterestFindMock = vi.fn(() => makeQuery(fixtures.suggestedInterestDocs));
const suggestedTaskFindMock = vi.fn(() => makeQuery(fixtures.suggestedTaskDocs));
const habitFindMock = vi.fn(() => makeQuery(fixtures.habitDocs));
const researchSubjectFindMock = vi.fn(() => makeQuery(fixtures.researchSubjectDocs));
const gameFindMock = vi.fn(() => makeQuery(fixtures.gameDocs));
const gameNoteFindMock = vi.fn(() => makeQuery(fixtures.gameNoteDocs));
const scheduleItemFindMock = vi.fn(() => makeQuery(fixtures.scheduleItemDocs));

vi.mock('../../middleware/auth.js', () => ({
  default: (req, _res, next) => {
    req.user = { userId: 'user123' };
    next();
  },
}));

vi.mock('../../models/Entry.js', () => ({ default: { find: (...args) => entryFindMock(...args) } }));
vi.mock('../../models/Task.js', () => ({ default: { find: (...args) => taskFindMock(...args) } }));
vi.mock('../../models/Goal.js', () => ({ default: { find: (...args) => goalFindMock(...args) } }));
vi.mock('../../models/Note.js', () => ({ default: { find: (...args) => noteFindMock(...args) } }));
vi.mock('../../models/Section.js', () => ({ default: { find: (...args) => sectionFindMock(...args) } }));
vi.mock('../../models/SectionPage.js', () => ({ default: { find: (...args) => sectionPageFindMock(...args) } }));
vi.mock('../../models/Cluster.js', () => ({ default: { find: (...args) => clusterFindMock(...args) } }));
vi.mock('../../models/Appointment.js', () => ({ default: { find: (...args) => appointmentFindMock(...args) } }));
vi.mock('../../models/ImportantEvent.js', () => ({ default: { find: (...args) => importantEventFindMock(...args) } }));
vi.mock('../../models/GatherItem.js', () => ({ default: { find: (...args) => gatherItemFindMock(...args) } }));
vi.mock('../../models/SuggestedGatherItem.js', () => ({ default: { find: (...args) => suggestedGatherItemFindMock(...args) } }));
vi.mock('../../models/Interest.js', () => ({ default: { find: (...args) => interestFindMock(...args) } }));
vi.mock('../../models/SuggestedInterest.js', () => ({ default: { find: (...args) => suggestedInterestFindMock(...args) } }));
vi.mock('../../models/SuggestedTask.js', () => ({ default: { find: (...args) => suggestedTaskFindMock(...args) } }));
vi.mock('../../models/Habit.js', () => ({ default: { find: (...args) => habitFindMock(...args) } }));
vi.mock('../../models/ResearchSubject.js', () => ({ default: { find: (...args) => researchSubjectFindMock(...args) } }));
vi.mock('../../models/Game.js', () => ({ default: { find: (...args) => gameFindMock(...args) } }));
vi.mock('../../models/GameNote.js', () => ({ default: { find: (...args) => gameNoteFindMock(...args) } }));
vi.mock('../../models/ScheduleItem.js', () => ({ default: { find: (...args) => scheduleItemFindMock(...args) } }));

const router = (await import('../search.js')).default;

function findHandler(path = '/') {
  const layer = router.stack.find((entry) => entry.route && entry.route.path === path);
  return layer?.route?.stack?.[0]?.handle;
}

describe('search excludes trashed entries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns active entries only and preserves other result types', async () => {
    const handler = findHandler('/');
    const req = { user: { userId: 'user123' }, query: { q: 'Alpha', type: 'all', limit: 10 } };
    const res = {
      statusCode: 200,
      body: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(data) {
        this.body = data;
        return this;
      },
    };

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(entryFindMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user123',
        deletedAt: null,
      }),
    );
    expect(taskFindMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user123',
        deletedAt: null,
      }),
    );

    expect(res.body.entries).toHaveLength(2);
    expect(res.body.entries.map((entry) => entry.text)).toEqual([
      'Alpha missing deletedAt',
      'Alpha active',
    ]);
    expect(res.body.entries.some((entry) => entry.text === 'Alpha trashed')).toBe(false);
    expect(res.body.tasks).toHaveLength(1);
    expect(res.body.total).toBe(3);
  });

  it('includes source metadata for suggested task search results', async () => {
    fixtures.suggestedTaskDocs = [
      {
        _id: 'suggested-task-1',
        title: 'Alpha review task',
        status: 'pending',
        dueDate: new Date('2026-07-09T00:00:00.000Z'),
        sourceRippleId: {
          _id: 'ripple-1',
          entryId: 'entry-active-1',
          dateKey: '2026-07-08',
          text: 'I need to handle the alpha review task tomorrow.',
        },
      },
    ];

    const handler = findHandler('/');
    const req = { user: { userId: 'user123' }, query: { q: 'Alpha', type: 'suggestedTasks', limit: 10 } };
    const res = {
      statusCode: 200,
      body: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(data) {
        this.body = data;
        return this;
      },
    };

    try {
      await handler(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body.suggestedTasks).toHaveLength(1);
      expect(res.body.suggestedTasks[0]).toMatchObject({
        type: 'suggestedTask',
        dueDate: '2026-07-09',
        sourceRippleId: 'ripple-1',
        sourceEntryId: 'entry-active-1',
        sourceDate: '2026-06-29',
        sourceText: 'I need to handle the alpha review task tomorrow.',
      });
    } finally {
      fixtures.suggestedTaskDocs = [];
    }
  });

  it('keeps results interactive while marking trashed and missing sources unavailable', async () => {
    fixtures.suggestedTaskDocs = [
      { _id: 'trashed-task', title: 'Alpha trashed task', sourceRippleId: { _id: 'r1', entryId: 'entry-trash-1', dateKey: '2026-06-28', text: 'Private source text' } },
      { _id: 'missing-task', title: 'Alpha missing task', sourceRippleId: { _id: 'r2', entryId: 'entry-missing', dateKey: '2026-06-27', text: 'Missing source text' } },
    ];
    const handler = findHandler('/');
    const req = { user: { userId: 'user123' }, query: { q: 'Alpha', type: 'suggestedTasks', limit: 10 } };
    const res = { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(data) { this.body = data; return this; } };

    try {
      await handler(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.body.suggestedTasks).toEqual(expect.arrayContaining([
        expect.objectContaining({ _id: 'trashed-task', sourceState: 'trashed', sourceAvailable: false, sourceText: '' }),
        expect.objectContaining({ _id: 'missing-task', sourceState: 'missing', sourceAvailable: false, sourceText: '' }),
      ]));
    } finally {
      fixtures.suggestedTaskDocs = [];
    }
  });

  it('returns an owner-scoped section slug for exact research destinations', async () => {
    fixtures.researchSubjectDocs = [{
      _id: 'subject-1',
      name: 'Alpha Person',
      slug: 'alpha-person',
      sectionId: 'section-1',
      notes: 'Alpha research notes',
    }];
    fixtures.sectionDocs = [{ _id: 'section-1', slug: 'family-history' }];
    const handler = findHandler('/');
    const req = { user: { userId: 'user123' }, query: { q: 'Alpha', type: 'researchSubjects', limit: 10 } };
    const res = { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(data) { this.body = data; return this; } };

    try {
      await handler(req, res);

      expect(sectionFindMock).toHaveBeenCalledWith({
        ownerId: 'user123',
        _id: { $in: ['section-1'] },
      });
      expect(res.body.researchSubjects[0]).toMatchObject({
        _id: 'subject-1',
        sectionSlug: 'family-history',
      });
    } finally {
      fixtures.researchSubjectDocs = [];
      fixtures.sectionDocs = [];
    }
  });
});
