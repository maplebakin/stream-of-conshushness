import { describe, expect, it } from 'vitest';
import { clearRequestId, stableRequestId } from '../idempotency.js';

describe('stableRequestId', () => {
  it('reuses an id for the same payload and rotates it when the payload changes', () => {
    const ref = { current: null };
    const first = stableRequestId(ref, 'same payload', 'task');
    expect(stableRequestId(ref, 'same payload', 'task')).toBe(first);
    expect(stableRequestId(ref, 'different payload', 'task')).not.toBe(first);
  });

  it('can be cleared after a durable response', () => {
    const ref = { current: null };
    const first = stableRequestId(ref, 'payload', 'task');
    clearRequestId(ref);
    expect(stableRequestId(ref, 'payload', 'task')).not.toBe(first);
  });
});
