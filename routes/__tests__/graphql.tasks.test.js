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

  it('filters by resolved cluster ObjectId while still supporting legacy slug matches', async () => {
    const clusterId = new mongoose.Types.ObjectId();
    resolveClusterIdForOwner.mockResolvedValue(clusterId);

    const tasks = [
      { _id: 'task1', title: 'Test task', clusters: [clusterId], cluster: clusterSlug },
    ];

    queryChain.lean.mockResolvedValue(tasks);

    const result = await root.tasks({ cluster: clusterSlug }, { user: { userId } });

    expect(resolveClusterIdForOwner).toHaveBeenCalledWith(userId, clusterSlug);
    expect(taskFindSpy).toHaveBeenCalledWith(expect.objectContaining({
      userId,
      $or: [
        { clusters: clusterId },
        { cluster: clusterSlug },
      ],
    }));
    expect(result).toEqual(tasks);
  });

  it('falls back to legacy string matching when resolution fails', async () => {
    resolveClusterIdForOwner.mockResolvedValue(null);

    const tasks = [
      { _id: 'task2', title: 'Legacy task', cluster: clusterSlug },
    ];

    queryChain.lean.mockResolvedValue(tasks);

    const result = await root.tasks({ cluster: clusterSlug }, { user: { userId } });

    const queryArg = taskFindSpy.mock.calls[0][0];
    expect(queryArg.cluster).toBe(clusterSlug);
    expect(queryArg.$or).toBeUndefined();
    expect(result).toEqual(tasks);
  });

  it('returns tasks when includeEntries is requested for a legacy slugged task', async () => {
    resolveClusterIdForOwner.mockResolvedValue(null);

    const tasks = [
      {
        _id: 'task3',
        title: 'Legacy task with entries',
        cluster: clusterSlug,
        sourceEntryId: { _id: 'entry1', date: '2024-11-01', text: 'Source text' },
        linkedEntryIds: [
          { _id: 'entry2', date: '2024-11-02', content: 'Linked content' },
        ],
      },
    ];

    queryChain.lean.mockResolvedValue(tasks);

    const result = await root.tasks({ cluster: clusterSlug, includeEntries: true }, { user: { userId } });

    expect(taskFindSpy).toHaveBeenCalledWith(expect.objectContaining({ cluster: clusterSlug }));
    expect(queryChain.populate).toHaveBeenCalledTimes(2);
    expect(result).toEqual([
      {
        _id: 'task3',
        title: 'Legacy task with entries',
        cluster: clusterSlug,
        sourceEntryId: { _id: 'entry1', date: '2024-11-01', text: 'Source text' },
        linkedEntryIds: [
          { _id: 'entry2', date: '2024-11-02', content: 'Linked content' },
        ],
        sourceEntry: { _id: 'entry1', date: '2024-11-01', preview: 'Source text' },
        linkedEntries: [
          { _id: 'entry2', date: '2024-11-02', preview: 'Linked content' },
        ],
      },
    ]);
  });
});

