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
}));

const entryFindMock = vi.fn((query = {}) => makeQuery(matchesActiveFilter(query) ? fixtures.entries.filter((entry) => entry.deletedAt == null) : fixtures.entries));
const taskFindMock = vi.fn(() => makeQuery(fixtures.taskDocs));
const goalFindMock = vi.fn(() => makeQuery(fixtures.goalDocs));
const noteFindMock = vi.fn(() => makeQuery(fixtures.noteDocs));
const sectionFindMock = vi.fn(() => makeQuery(fixtures.sectionDocs));
const sectionPageFindMock = vi.fn(() => makeQuery(fixtures.sectionPageDocs));
const clusterFindMock = vi.fn(() => makeQuery(fixtures.clusterDocs));

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

    expect(res.body.entries).toHaveLength(2);
    expect(res.body.entries.map((entry) => entry.text)).toEqual([
      'Alpha missing deletedAt',
      'Alpha active',
    ]);
    expect(res.body.entries.some((entry) => entry.text === 'Alpha trashed')).toBe(false);
    expect(res.body.tasks).toHaveLength(1);
    expect(res.body.total).toBe(3);
  });
});
