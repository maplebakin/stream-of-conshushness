import { describe, expect, it } from 'vitest';
import { todayISOInToronto, todayISOInTZ } from '../../frontend/src/utils/date.js';

describe('frontend Toronto date helpers', () => {
  it('returns YYYY-MM-DD with no argument', () => {
    expect(todayISOInToronto()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('supports a deterministic base Date', () => {
    const base = new Date('2026-03-08T06:30:00Z');
    expect(todayISOInToronto(base)).toBe('2026-03-08');
    expect(todayISOInTZ('America/Toronto', base)).toBe('2026-03-08');
  });
});
