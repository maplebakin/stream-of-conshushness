import { describe, expect, it } from 'vitest';
import {
  TORONTO_TZ,
  addDaysISO,
  normalizeDate,
  todayISOInTZ,
  torontoYmd,
} from '../date.js';

describe('backend Toronto date helpers', () => {
  it('returns YYYY-MM-DD for Toronto today from a supplied base date', () => {
    const base = new Date('2026-03-08T06:30:00Z');

    expect(todayISOInTZ(TORONTO_TZ, base)).toBe('2026-03-08');
    expect(torontoYmd(base)).toBe('2026-03-08');
  });

  it('normalizes date-like input to Toronto YYYY-MM-DD', () => {
    expect(normalizeDate('2026-06-09')).toBe('2026-06-09');
    expect(normalizeDate('2026-06-09T00:30:00+14:00')).toBe('2026-06-08');
  });

  it('adds days using noon-anchored date math without DST rollback', () => {
    expect(addDaysISO('2026-03-08', 1)).toBe('2026-03-09');
    expect(addDaysISO('2026-11-01', 1)).toBe('2026-11-02');
  });
});
