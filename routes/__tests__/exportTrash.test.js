import { beforeEach, describe, expect, it, vi } from 'vitest';

const makeAsyncCursor = async function* (docs) {
  for (const doc of docs) yield doc;
};

function makeQuery(docs) {
  const sortDocs = (sortSpec) => {
    if (!sortSpec || sortSpec.date !== -1) return docs;
    return [...docs].sort((a, b) => {
      const aTime = new Date(a.date || a.createdAt || 0).getTime();
      const bTime = new Date(b.date || b.createdAt || 0).getTime();
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
    limit: vi.fn(() => query),
    lean: vi.fn(() => query),
    cursor: vi.fn(() => makeAsyncCursor(query._docs)),
    then: (resolve, reject) => Promise.resolve(query._docs).then(resolve, reject),
  };
  return query;
}

function activeEntries() {
  return fixtures.entries.filter((entry) => entry.deletedAt == null);
}

const fixtures = vi.hoisted(() => ({
  user: {
    _id: 'user123',
    username: 'alice',
    email: 'alice@example.com',
    isAdmin: false,
    profilePicture: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    emailVerifiedAt: null,
  },
  entries: [
    { _id: 'entry-active-1', date: '2026-06-30', text: 'Alpha active', mood: 'calm', tags: ['daily'], pinned: false, createdAt: '2026-06-30T10:00:00.000Z', deletedAt: null },
    { _id: 'entry-active-2', date: '2026-06-29', text: 'Alpha missing deletedAt', mood: 'focused', tags: [], pinned: true, createdAt: '2026-06-29T10:00:00.000Z' },
    { _id: 'entry-trash-1', date: '2026-06-28', text: 'Alpha trashed', mood: 'sad', tags: ['trash'], pinned: false, createdAt: '2026-06-28T10:00:00.000Z', deletedAt: new Date('2026-06-30T12:00:00Z') },
  ],
  tasks: [{ _id: 'task-1' }, { _id: 'task-2' }],
  goals: [{ _id: 'goal-1' }],
  notes: [{ _id: 'note-1' }],
  habits: [{ _id: 'habit-1' }],
  clusters: [{ _id: 'cluster-1' }],
  sections: [{ _id: 'section-1' }],
  sectionPages: [{ _id: 'page-1' }],
  appointments: [{ _id: 'appt-1' }],
  importantEvents: [{ _id: 'event-1' }],
  ripples: [{ _id: 'ripple-1' }],
  suggestedTasks: [{ _id: 'suggested-task-1' }],
  gatherItems: [{ _id: 'gather-item-1' }],
  suggestedGatherItems: [{ _id: 'suggested-gather-1' }],
  interests: [{ _id: 'interest-1' }],
  suggestedInterests: [{ _id: 'suggested-interest-1' }],
  researchSubjects: [{ _id: 'research-1' }],
  games: [{ _id: 'game-1' }],
  gameNotes: [{ _id: 'game-note-1' }],
  scheduleItems: [{ _id: 'schedule-item-1' }],
}));

const entryFindMock = vi.fn((query = {}) => makeQuery(query?.deletedAt === null ? activeEntries() : fixtures.entries));
const entryCountMock = vi.fn((query = {}) => Promise.resolve(query?.deletedAt === null ? activeEntries().length : fixtures.entries.length));

const taskFindMock = vi.fn(() => makeQuery(fixtures.tasks));
const taskCountMock = vi.fn(() => Promise.resolve(fixtures.tasks.length));
const goalFindMock = vi.fn(() => makeQuery(fixtures.goals));
const goalCountMock = vi.fn(() => Promise.resolve(fixtures.goals.length));
const noteFindMock = vi.fn(() => makeQuery(fixtures.notes));
const noteCountMock = vi.fn(() => Promise.resolve(fixtures.notes.length));
const habitFindMock = vi.fn(() => makeQuery(fixtures.habits));
const habitCountMock = vi.fn(() => Promise.resolve(fixtures.habits.length));
const clusterFindMock = vi.fn(() => makeQuery(fixtures.clusters));
const clusterCountMock = vi.fn(() => Promise.resolve(fixtures.clusters.length));
const sectionFindMock = vi.fn(() => makeQuery(fixtures.sections));
const sectionCountMock = vi.fn(() => Promise.resolve(fixtures.sections.length));
const sectionPageFindMock = vi.fn(() => makeQuery(fixtures.sectionPages));
const sectionPageCountMock = vi.fn(() => Promise.resolve(fixtures.sectionPages.length));
const appointmentFindMock = vi.fn(() => makeQuery(fixtures.appointments));
const appointmentCountMock = vi.fn(() => Promise.resolve(fixtures.appointments.length));
const importantEventFindMock = vi.fn(() => makeQuery(fixtures.importantEvents));
const importantEventCountMock = vi.fn(() => Promise.resolve(fixtures.importantEvents.length));
const rippleFindMock = vi.fn(() => makeQuery(fixtures.ripples));
const rippleCountMock = vi.fn(() => Promise.resolve(fixtures.ripples.length));
const suggestedTaskFindMock = vi.fn(() => makeQuery(fixtures.suggestedTasks));
const suggestedTaskCountMock = vi.fn(() => Promise.resolve(fixtures.suggestedTasks.length));
const gatherItemFindMock = vi.fn(() => makeQuery(fixtures.gatherItems));
const gatherItemCountMock = vi.fn(() => Promise.resolve(fixtures.gatherItems.length));
const suggestedGatherItemFindMock = vi.fn(() => makeQuery(fixtures.suggestedGatherItems));
const suggestedGatherItemCountMock = vi.fn(() => Promise.resolve(fixtures.suggestedGatherItems.length));
const interestFindMock = vi.fn(() => makeQuery(fixtures.interests));
const interestCountMock = vi.fn(() => Promise.resolve(fixtures.interests.length));
const suggestedInterestFindMock = vi.fn(() => makeQuery(fixtures.suggestedInterests));
const suggestedInterestCountMock = vi.fn(() => Promise.resolve(fixtures.suggestedInterests.length));
const researchSubjectFindMock = vi.fn(() => makeQuery(fixtures.researchSubjects));
const researchSubjectCountMock = vi.fn(() => Promise.resolve(fixtures.researchSubjects.length));
const gameFindMock = vi.fn(() => makeQuery(fixtures.games));
const gameCountMock = vi.fn(() => Promise.resolve(fixtures.games.length));
const gameNoteFindMock = vi.fn(() => makeQuery(fixtures.gameNotes));
const gameNoteCountMock = vi.fn(() => Promise.resolve(fixtures.gameNotes.length));
const scheduleItemFindMock = vi.fn(() => makeQuery(fixtures.scheduleItems));
const scheduleItemCountMock = vi.fn(() => Promise.resolve(fixtures.scheduleItems.length));

vi.mock('../../middleware/auth.js', () => ({
  default: (req, _res, next) => {
    req.user = { userId: 'user123' };
    next();
  },
}));

vi.mock('../../models/User.js', () => ({
  default: {
    findById: vi.fn(() => ({
      select: vi.fn(() => ({
        lean: vi.fn(() => Promise.resolve(fixtures.user)),
      })),
    })),
  },
}));
vi.mock('../../models/Entry.js', () => ({ default: { find: (...args) => entryFindMock(...args), countDocuments: (...args) => entryCountMock(...args) } }));
vi.mock('../../models/Task.js', () => ({ default: { find: (...args) => taskFindMock(...args), countDocuments: (...args) => taskCountMock(...args) } }));
vi.mock('../../models/Goal.js', () => ({ default: { find: (...args) => goalFindMock(...args), countDocuments: (...args) => goalCountMock(...args) } }));
vi.mock('../../models/Note.js', () => ({ default: { find: (...args) => noteFindMock(...args), countDocuments: (...args) => noteCountMock(...args) } }));
vi.mock('../../models/Habit.js', () => ({ default: { find: (...args) => habitFindMock(...args), countDocuments: (...args) => habitCountMock(...args) } }));
vi.mock('../../models/Cluster.js', () => ({ default: { find: (...args) => clusterFindMock(...args), countDocuments: (...args) => clusterCountMock(...args) } }));
vi.mock('../../models/Section.js', () => ({ default: { find: (...args) => sectionFindMock(...args), countDocuments: (...args) => sectionCountMock(...args) } }));
vi.mock('../../models/SectionPage.js', () => ({ default: { find: (...args) => sectionPageFindMock(...args), countDocuments: (...args) => sectionPageCountMock(...args) } }));
vi.mock('../../models/Appointment.js', () => ({ default: { find: (...args) => appointmentFindMock(...args), countDocuments: (...args) => appointmentCountMock(...args) } }));
vi.mock('../../models/ImportantEvent.js', () => ({ default: { find: (...args) => importantEventFindMock(...args), countDocuments: (...args) => importantEventCountMock(...args) } }));
vi.mock('../../models/Ripple.js', () => ({ default: { find: (...args) => rippleFindMock(...args), countDocuments: (...args) => rippleCountMock(...args) } }));
vi.mock('../../models/SuggestedTask.js', () => ({ default: { find: (...args) => suggestedTaskFindMock(...args), countDocuments: (...args) => suggestedTaskCountMock(...args) } }));
vi.mock('../../models/GatherItem.js', () => ({ default: { find: (...args) => gatherItemFindMock(...args), countDocuments: (...args) => gatherItemCountMock(...args) } }));
vi.mock('../../models/SuggestedGatherItem.js', () => ({ default: { find: (...args) => suggestedGatherItemFindMock(...args), countDocuments: (...args) => suggestedGatherItemCountMock(...args) } }));
vi.mock('../../models/Interest.js', () => ({ default: { find: (...args) => interestFindMock(...args), countDocuments: (...args) => interestCountMock(...args) } }));
vi.mock('../../models/SuggestedInterest.js', () => ({ default: { find: (...args) => suggestedInterestFindMock(...args), countDocuments: (...args) => suggestedInterestCountMock(...args) } }));
vi.mock('../../models/ResearchSubject.js', () => ({ default: { find: (...args) => researchSubjectFindMock(...args), countDocuments: (...args) => researchSubjectCountMock(...args) } }));
vi.mock('../../models/Game.js', () => ({ default: { find: (...args) => gameFindMock(...args), countDocuments: (...args) => gameCountMock(...args) } }));
vi.mock('../../models/GameNote.js', () => ({ default: { find: (...args) => gameNoteFindMock(...args), countDocuments: (...args) => gameNoteCountMock(...args) } }));
vi.mock('../../models/ScheduleItem.js', () => ({ default: { find: (...args) => scheduleItemFindMock(...args), countDocuments: (...args) => scheduleItemCountMock(...args) } }));

const router = (await import('../export.js')).default;

function findHandler(path) {
  const layer = router.stack.find((entry) => entry.route && entry.route.path === path);
  return layer?.route?.stack?.[0]?.handle;
}

describe('export excludes trashed entries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('excludes trashed entries from JSON export and statistics', async () => {
    const handler = findHandler('/json');
    const res = {
      statusCode: 200,
      headersSent: false,
      headers: {},
      chunks: [],
      body: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      setHeader(key, value) {
        this.headers[key] = value;
      },
      write(chunk) {
        this.chunks.push(String(chunk));
        return true;
      },
      end(chunk = '') {
        if (chunk) this.chunks.push(String(chunk));
        this.body = this.chunks.join('');
        this.headersSent = true;
        return this;
      },
      json(data) {
        this.body = data;
        this.headersSent = true;
        return this;
      },
    };

    const req = { user: { userId: 'user123' }, query: {} };
    await handler(req, res);
    const payload = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(entryFindMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user123',
        deletedAt: null,
      }),
    );
    expect(entryCountMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user123',
        deletedAt: null,
      }),
    );

    expect(payload.data.entries).toHaveLength(2);
    expect(payload.data.entries.some((entry) => entry.text === 'Alpha trashed')).toBe(false);
    expect(payload.statistics.totalEntries).toBe(2);
    expect(payload.statistics.totalTasks).toBe(fixtures.tasks.length);
  });

  it('excludes trashed entries from CSV export', async () => {
    const handler = findHandler('/csv/entries');
    const res = {
      statusCode: 200,
      headers: {},
      body: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      setHeader(key, value) {
        this.headers[key] = value;
      },
      send(data) {
        this.body = data;
        return this;
      },
    };
    await handler({ user: { userId: 'user123' }, query: {} }, res);

    expect(res.statusCode).toBe(200);
    expect(entryFindMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user123',
        deletedAt: null,
      }),
    );
    expect(String(res.body)).toContain('Alpha active');
    expect(String(res.body)).toContain('Alpha missing deletedAt');
    expect(String(res.body)).not.toContain('Alpha trashed');
  });

  it('keeps non-entry statistics intact', async () => {
    const handler = findHandler('/statistics');
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
    await handler({ user: { userId: 'user123' }, query: {} }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      entries: 2,
      tasks: fixtures.tasks.length,
      goals: fixtures.goals.length,
      notes: fixtures.notes.length,
      habits: fixtures.habits.length,
      clusters: fixtures.clusters.length,
      sections: fixtures.sections.length,
      appointments: fixtures.appointments.length,
    });
  });
});
