import mongoose from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findOne: vi.fn(),
}));

vi.mock('../../models/Cluster.js', () => ({
  default: {
    findOne: (...args) => mocks.findOne(...args),
  },
  slugifyClusterSlug: (value = '') => String(value).trim().toLowerCase().replace(/\s+/g, '-'),
}));

const { resolveClusterIdForOwner, resolveClusterIdsForOwner } = await import('../clusterIds.js');

function queryResult(value) {
  return {
    select: vi.fn().mockReturnThis(),
    lean: vi.fn().mockResolvedValue(value),
  };
}

describe('owned cluster resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('checks ObjectId ownership instead of trusting a syntactically valid id', async () => {
    const clusterId = new mongoose.Types.ObjectId();
    mocks.findOne.mockReturnValueOnce(queryResult(null));

    await expect(resolveClusterIdForOwner('owner-a', clusterId)).resolves.toBeNull();
    expect(mocks.findOne).toHaveBeenCalledWith({ ownerId: 'owner-a', _id: clusterId });
  });

  it('returns only clusters that belong to the authenticated owner', async () => {
    const owned = new mongoose.Types.ObjectId();
    const foreign = new mongoose.Types.ObjectId();
    mocks.findOne
      .mockReturnValueOnce(queryResult({ _id: owned }))
      .mockReturnValueOnce(queryResult(null));

    await expect(resolveClusterIdsForOwner('owner-a', [owned, foreign])).resolves.toEqual([owned]);
  });
});
