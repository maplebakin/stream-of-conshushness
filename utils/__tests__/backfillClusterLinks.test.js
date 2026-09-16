import { describe, expect, it } from 'vitest';
import {
  migrationMode,
  planOwnedClusterLinks,
  requiredMongoUri,
} from '../../scripts/migrations/backfillClusterLinks.mjs';

const ownerClusterId = '64b000000000000000000001';
const secondOwnerClusterId = '64b000000000000000000002';
const foreignClusterId = '64b000000000000000000099';

describe('cluster link migration safety', () => {
  it('is dry-run by default and requires an explicit apply flag to write', () => {
    expect(migrationMode([])).toEqual({ apply: false });
    expect(migrationMode(['--dry-run'])).toEqual({ apply: false });
    expect(migrationMode(['--apply'])).toEqual({ apply: true });
    expect(() => migrationMode(['--apply', '--dry-run'])).toThrow(/either/i);
    expect(() => migrationMode(['--force'])).toThrow(/unknown/i);
  });

  it('requires an explicit MongoDB URL instead of falling back to a guessed database', () => {
    expect(() => requiredMongoUri({})).toThrow(/MONGODB_URI is required/);
    expect(() => requiredMongoUri({ MONGODB_URI: 'localhost/private' })).toThrow(/MongoDB connection URL/);
    expect(requiredMongoUri({ MONGODB_URI: 'mongodb://localhost:27017/private' }))
      .toBe('mongodb://localhost:27017/private');
  });

  it('keeps only owner clusters, resolves legacy names, and reports corrupt references', () => {
    const plan = planOwnedClusterLinks({
      currentValues: [ownerClusterId, foreignClusterId, ownerClusterId],
      legacyValues: ['Home', 'not-a-real-cluster', secondOwnerClusterId],
      ownerClusters: [
        { _id: ownerClusterId, slug: 'work', name: 'Work' },
        { _id: secondOwnerClusterId, slug: 'home', name: 'Home' },
      ],
    });

    expect(plan).toEqual({
      changed: true,
      finalIds: [ownerClusterId, secondOwnerClusterId],
      droppedForeignOrMissing: 1,
      unresolvedLegacy: 1,
    });
  });

  it('leaves an already canonical owner-scoped array unchanged', () => {
    expect(planOwnedClusterLinks({
      currentValues: [ownerClusterId, secondOwnerClusterId],
      ownerClusters: [
        { _id: ownerClusterId, slug: 'work', name: 'Work' },
        { _id: secondOwnerClusterId, slug: 'home', name: 'Home' },
      ],
    })).toMatchObject({
      changed: false,
      finalIds: [ownerClusterId, secondOwnerClusterId],
      droppedForeignOrMissing: 0,
      unresolvedLegacy: 0,
    });
  });
});
