import { describe, expect, it } from 'vitest';
import Ripple from '../../models/Ripple.js';

describe('Ripple schema integrity', () => {
  it('uniquely indexes direct-analysis receipts without affecting legacy rows', () => {
    const index = Ripple.schema.indexes().find(([fields]) => (
      fields.userId === 1 && fields.analysisKey === 1
    ));

    expect(index).toBeDefined();
    expect(index[1]).toMatchObject({
      unique: true,
      partialFilterExpression: { analysisKey: { $type: 'string' } },
    });
    expect(Ripple.schema.path('analysisKey').options).toMatchObject({
      maxlength: 64,
      default: undefined,
    });
  });
});
