import { describe, expect, it } from 'vitest';
import { legacyClusterIndexNames } from '../../scripts/fixClusterIndexes.js';
import { normalizedLegacyPriority } from '../../scripts/fix_bad_tasks.mjs';
import { normalizedIsoDate } from '../../scripts/debug_carry_forward.mjs';
import {
  mutationMode,
  requiredMongoUri,
  requiredOwnerId,
} from '../../scripts/maintenanceSafety.mjs';

describe('maintenance script safety', () => {
  it('requires an explicit syntactically valid MongoDB URI', () => {
    expect(() => requiredMongoUri({})).toThrow(/MONGODB_URI is required/);
    expect(() => requiredMongoUri({ MONGODB_URI: 'http://example.test/database' })).toThrow(/MongoDB connection URL/);
    expect(() => requiredMongoUri({ MONGODB_URI: 'mongodb://' })).toThrow(/MongoDB connection URL/);
    expect(requiredMongoUri({ MONGODB_URI: 'mongodb://user:pass@db.example.test/app' }))
      .toBe('mongodb://user:pass@db.example.test/app');
    expect(requiredMongoUri({ MONGODB_URI: 'mongodb://db-a:27017,db-b:27017/app' }))
      .toBe('mongodb://db-a:27017,db-b:27017/app');
  });

  it('defaults mutations to dry-run and requires an unambiguous apply flag', () => {
    expect(mutationMode([])).toEqual({ apply: false });
    expect(mutationMode(['--dry-run'])).toEqual({ apply: false });
    expect(mutationMode(['--apply'])).toEqual({ apply: true });
    expect(() => mutationMode(['--apply', '--dry-run'])).toThrow(/either/);
    expect(() => mutationMode(['--force'])).toThrow(/Unknown option/);
  });

  it('requires an exact owner ObjectId for task maintenance', () => {
    expect(() => requiredOwnerId({})).toThrow(/USER_ID is required/);
    expect(() => requiredOwnerId({ USER_ID: 'not-an-id' })).toThrow(/ObjectId/);
    expect(requiredOwnerId({ USER_ID: '507f1f77bcf86cd799439011' }))
      .toBe('507f1f77bcf86cd799439011');
  });

  it('identifies only the obsolete unscoped cluster key index', () => {
    expect(legacyClusterIndexNames([
      { name: '_id_', key: { _id: 1 } },
      { name: 'key_1', key: { key: 1 } },
      { name: 'userId_1_key_1', key: { userId: 1, key: 1 } },
      { name: 'custom_compound', key: { ownerId: 1, key: 1 } },
    ])).toEqual(['key_1']);
  });

  it('normalizes legacy priorities without reading task text', () => {
    expect(normalizedLegacyPriority('high')).toBe(3);
    expect(normalizedLegacyPriority(' MED ')).toBe(2);
    expect(normalizedLegacyPriority('7')).toBe(7);
    expect(normalizedLegacyPriority('unknown')).toBe(0);
  });

  it('accepts real calendar dates and rejects normalized overflow dates', () => {
    expect(normalizedIsoDate('2026-7-3')).toBe('2026-07-03');
    expect(normalizedIsoDate('2024-02-29')).toBe('2024-02-29');
    expect(normalizedIsoDate('2025-02-29')).toBeNull();
    expect(normalizedIsoDate('2026-13-01')).toBeNull();
  });
});
