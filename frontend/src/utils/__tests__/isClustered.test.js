import { describe, expect, it } from 'vitest';

import { isClustered } from '../isClustered.js';

describe('isClustered', () => {
  it('returns false when entry has no cluster data', () => {
    expect(isClustered({})).toBe(false);
    expect(isClustered(null)).toBe(false);
  });

  it('returns true when a legacy cluster string is present', () => {
    expect(isClustered({ cluster: 'focus' })).toBe(true);
    expect(isClustered({ cluster: '   focus   ' })).toBe(true);
  });

  it('returns false for empty or whitespace cluster strings', () => {
    expect(isClustered({ cluster: '' })).toBe(false);
    expect(isClustered({ cluster: '   ' })).toBe(false);
  });

  it('returns true when the clusters array has entries', () => {
    expect(isClustered({ clusters: ['abc123'] })).toBe(true);
    expect(isClustered({ clusters: [null, 'abc123'] })).toBe(true);
  });

  it('returns false when the clusters array lacks usable values', () => {
    expect(isClustered({ clusters: [] })).toBe(false);
    expect(isClustered({ clusters: ['   ', null] })).toBe(false);
  });
});
