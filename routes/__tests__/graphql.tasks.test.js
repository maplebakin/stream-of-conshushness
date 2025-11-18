// routes/__tests__/graphql.tasks.test.js
// Ensures the GraphQL tasks resolver resolves cluster slugs to ObjectIds

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import mongoose from 'mongoose';

vi.mock('../../utils/clusterIds.js', () => ({
  resolveClusterIdForOwner: vi.fn(),
}));

import Task from '../../models/Task.js';
import root from '../../graphql/resolvers.js';
import { resolveClusterIdForOwner } from '../../utils/clusterIds.js';

describe('GraphQL tasks resolver', () => {
  const userId = new mongoose.Types.ObjectId().toString();
  const clusterSlug = 'marketing';

  let taskFindSpy;
  let queryChain;

  beforeEach(() => {
    queryChain = {
      sort: vi.fn(),
      skip: vi.fn(),
      limit: vi.fn(),
      populate: vi.fn(),
      lean: vi.fn(),
    };

    queryChain.sort.mockReturnValue(queryChain);
    queryChain.skip.mockReturnValue(queryChain);
    queryChain.limit.mockReturnValue(queryChain);
    queryChain.populate.mockReturnValue(queryChain);

    taskFindSpy = vi.spyOn(Task, 'find').mockReturnValue(queryChain);
    resolveClusterIdForOwner.mockReset();
  });

  afterEach(() => {
    taskFindSpy.mockRestore();
    vi.clearAllMocks();
  });

  it('filters by resolved cluster ObjectId when given a slug', async () => {
    const clusterId = new mongoose.Types.ObjectId();
    resolveClusterIdForOwner.mockResolvedValue(clusterId);

    const tasks = [
      { _id: 'task1', title: 'Test task', clusters: [clusterId] },
    ];

    queryChain.lean.mockResolvedValue(tasks);

    const result = await root.tasks({ cluster: clusterSlug }, { user: { userId } });

    expect(resolveClusterIdForOwner).toHaveBeenCalledWith(userId, clusterSlug);
    expect(taskFindSpy).toHaveBeenCalledWith(expect.objectContaining({
      userId,
      clusters: clusterId,
    }));
    expect(result).toEqual(tasks);
  });

  it('falls back to legacy string matching when resolution fails', async () => {
    resolveClusterIdForOwner.mockResolvedValue(null);

    const tasks = [
      { _id: 'task2', title: 'Legacy task', clusters: ['marketing'] },
    ];

    queryChain.lean.mockResolvedValue(tasks);

    const result = await root.tasks({ cluster: clusterSlug }, { user: { userId } });

    const queryArg = taskFindSpy.mock.calls[0][0];
    expect(queryArg.clusters).toBeInstanceOf(RegExp);
    expect(queryArg.clusters.test('marketing')).toBe(true);
    expect(result).toEqual(tasks);
  });

  it('returns entry previews when includeEntries is true', async () => {
    const entry = { _id: 'entry1', date: '2024-10-01', text: 'Entry text' };
    const linked = { _id: 'entry2', date: '2024-10-02', content: 'Linked content' };

    const tasks = [
      { _id: 'task3', title: 'With entries', entryId: entry, linkedEntryIds: [linked] },
    ];

    queryChain.lean.mockResolvedValue(tasks);

    const result = await root.tasks({ includeEntries: true }, { user: { userId } });

    expect(queryChain.populate).toHaveBeenCalledWith('sourceEntryId', 'date text content');
    expect(queryChain.populate).toHaveBeenCalledWith('entryId', 'date text content');
    expect(queryChain.populate).toHaveBeenCalledWith('linkedEntryIds', 'date text content');

    expect(result).toEqual([
      {
        ...tasks[0],
        sourceEntry: { _id: 'entry1', date: '2024-10-01', preview: 'Entry text' },
        linkedEntries: [{ _id: 'entry2', date: '2024-10-02', preview: 'Linked content' }],
      },
    ]);
  });
});

