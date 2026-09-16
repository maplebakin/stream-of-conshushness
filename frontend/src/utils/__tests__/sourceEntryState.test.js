import { describe, expect, it } from 'vitest';
import { entryPath, sourceEntryPath, sourceStateLabel } from '../sourceEntryState.js';

describe('source entry UI state helpers', () => {
  it('keeps active source navigation and omits unavailable source navigation', () => {
    expect(sourceEntryPath({ sourceState: 'active', sourceEntryId: 'entry 1', sourceDate: '2026-07-08' }))
      .toBe('/day/2026-07-08#entry-entry%201');
    expect(sourceEntryPath({ sourceState: 'trashed', sourceEntryId: 'entry-2', sourceDate: '2026-07-07' })).toBe('');
    expect(sourceEntryPath({ sourceState: 'missing', sourceEntryId: 'entry-3', sourceDate: '2026-07-06' })).toBe('');
  });

  it('builds a reachable day-and-anchor path for an entry', () => {
    expect(entryPath({ _id: 'entry 1', date: '2026-07-08' }))
      .toBe('/day/2026-07-08#entry-entry%201');
    expect(entryPath({ _id: 'entry-2' })).toBe('');
  });

  it('uses readable unavailable-source labels', () => {
    expect(sourceStateLabel({ sourceState: 'trashed' })).toBe('Source in Trash');
    expect(sourceStateLabel({ sourceState: 'missing' })).toBe('Source unavailable');
  });
});
