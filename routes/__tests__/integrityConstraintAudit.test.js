import { describe, expect, it } from 'vitest';
import { duplicatePipeline, INTEGRITY_CHECKS } from '../../scripts/migrations/auditIntegrityConstraints.mjs';

describe('integrity constraint audit', () => {
  it('counts duplicate owner-scoped receipts without returning sensitive values', () => {
    expect(duplicatePipeline({
      fields: ['userId', 'clientRequestId'],
      match: { clientRequestId: { $type: 'string' } },
    })).toEqual([
      { $match: { clientRequestId: { $type: 'string' } } },
      { $group: {
        _id: { userId: '$userId', clientRequestId: '$clientRequestId' },
        count: { $sum: 1 },
      } },
      { $match: { count: { $gt: 1 } } },
      { $count: 'duplicateGroups' },
    ]);
  });

  it('covers every new retry and provenance constraint', () => {
    expect(INTEGRITY_CHECKS.map((check) => check.name)).toEqual(expect.arrayContaining([
      'normalized email',
      'legacy normalized email identity',
      'entry capture receipt',
      'manual task receipt',
      'recurring successor provenance',
      'appointment one-off identity',
      'daily note identity',
      'legacy unclustered daily note identity',
      'direct ripple analysis receipt',
    ]));
  });

  it('can normalize legacy identity fields inside MongoDB without returning their values', () => {
    expect(duplicatePipeline({
      match: { email: { $type: 'string', $ne: '' } },
      group: { emailNormalized: { $toLower: { $trim: { input: '$email' } } } },
    })[1]).toEqual({
      $group: {
        _id: { emailNormalized: { $toLower: { $trim: { input: '$email' } } } },
        count: { $sum: 1 },
      },
    });
  });
});
