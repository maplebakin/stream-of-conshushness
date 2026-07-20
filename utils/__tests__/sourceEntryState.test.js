import { describe, expect, it } from 'vitest';
import { sourceEntryMeta } from '../sourceEntryState.js';

describe('source entry state metadata', () => {
  const sourceMap = new Map([
    ['active', { _id: 'active', date: '2026-07-08', text: 'Active source text', deletedAt: null }],
    ['trashed', { _id: 'trashed', date: '2026-07-07', text: 'Private trashed source text', deletedAt: new Date('2026-07-09') }],
  ]);

  it('returns active source navigation metadata and excerpts only for active sources', () => {
    expect(sourceEntryMeta(sourceMap, 'active', { includeExcerpt: true })).toEqual({
      sourceEntryId: 'active',
      sourceEntryDate: '2026-07-08',
      sourceDate: '2026-07-08',
      sourceTitle: '',
      sourceState: 'active',
      sourceAvailable: true,
      sourceEntryExcerpt: 'Active source text',
    });
  });

  it('preserves trashed and missing provenance IDs without exposing source content', () => {
    expect(sourceEntryMeta(sourceMap, 'trashed', { includeExcerpt: true })).toEqual({
      sourceEntryId: 'trashed',
      sourceState: 'trashed',
      sourceAvailable: false,
    });
    expect(sourceEntryMeta(sourceMap, 'missing', { includeExcerpt: true })).toEqual({
      sourceEntryId: 'missing',
      sourceState: 'missing',
      sourceAvailable: false,
    });
  });

  it('returns an existing artifact to active source behavior after restoration without changing its identity', () => {
    const artifact = { _id: 'calendar-artifact-1', entryId: 'lifecycle-entry', source: 'user-edited' };
    const trashed = sourceEntryMeta(new Map([
      ['lifecycle-entry', { _id: 'lifecycle-entry', deletedAt: new Date('2026-07-09') }],
    ]), artifact.entryId);
    const restored = sourceEntryMeta(new Map([
      ['lifecycle-entry', { _id: 'lifecycle-entry', date: '2026-07-08', deletedAt: null }],
    ]), artifact.entryId);

    expect(artifact).toMatchObject({ _id: 'calendar-artifact-1', source: 'user-edited' });
    expect(trashed).toMatchObject({ sourceState: 'trashed', sourceAvailable: false });
    expect(restored).toMatchObject({ sourceState: 'active', sourceAvailable: true, sourceDate: '2026-07-08' });
  });
});
