import { describe, expect, it } from 'vitest';
import { primaryClusterReference, resolveClusterId } from '../clusterHelpers.js';

const clusters = [
  { id: 'cluster-id', slug: 'home', name: 'Home' },
];

describe('cluster assignment helpers', () => {
  it('prefers an ObjectId-array assignment over the legacy slug', () => {
    expect(primaryClusterReference({
      cluster: 'legacy',
      clusters: [{ _id: 'cluster-id', slug: 'home' }],
    })).toBe('cluster-id');
  });

  it('resolves ids from an id, slug, or name', () => {
    expect(resolveClusterId('cluster-id', clusters)).toBe('cluster-id');
    expect(resolveClusterId('home', clusters)).toBe('cluster-id');
    expect(resolveClusterId('Home', clusters)).toBe('cluster-id');
  });
});
