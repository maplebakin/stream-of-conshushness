import { describe, expect, it } from 'vitest';
import {
  MAX_RECURRENCE_ITERATIONS,
  expandDatesInRange,
  isValidISODate,
  nextMonthlyOccurrenceISO,
  recurrenceValidationError,
} from '../recurrence.js';

const expandMonthly = (rule, start, to = '2027-12-31') => (
  expandDatesInRange(rule, start, start, to)
);

describe('monthly RRULE expansion', () => {
  it('skips nonexistent month-days instead of overflowing January 31 into March 3', () => {
    const dates = expandMonthly('FREQ=MONTHLY', '2026-01-31', '2026-09-01');

    expect(dates).toEqual([
      '2026-01-31',
      '2026-03-31',
      '2026-05-31',
      '2026-07-31',
      '2026-08-31',
    ]);
    expect(dates).not.toContain('2026-03-03');
  });

  it('handles January 29 across leap and non-leap Februaries', () => {
    expect(expandMonthly('FREQ=MONTHLY', '2024-01-29', '2024-04-01')).toEqual([
      '2024-01-29', '2024-02-29', '2024-03-29',
    ]);
    expect(expandMonthly('FREQ=MONTHLY', '2025-01-29', '2025-04-01')).toEqual([
      '2025-01-29', '2025-03-29',
    ]);
  });

  it('preserves valid month-end days without clamping', () => {
    expect(expandMonthly('FREQ=MONTHLY', '2026-01-30', '2026-06-01')).toEqual([
      '2026-01-30', '2026-03-30', '2026-04-30', '2026-05-30',
    ]);
    expect(expandMonthly('FREQ=MONTHLY', '2026-03-31', '2026-09-01')).toEqual([
      '2026-03-31', '2026-05-31', '2026-07-31', '2026-08-31',
    ]);
    expect(expandMonthly('FREQ=MONTHLY', '2026-05-31', '2026-12-01')).toEqual([
      '2026-05-31', '2026-07-31', '2026-08-31', '2026-10-31',
    ]);
    expect(expandMonthly('FREQ=MONTHLY', '2026-08-31', '2027-02-01')).toEqual([
      '2026-08-31', '2026-10-31', '2026-12-31', '2027-01-31',
    ]);
  });

  it('keeps interval cadence while skipping invalid candidate months', () => {
    expect(expandMonthly('FREQ=MONTHLY;INTERVAL=2', '2026-01-31', '2026-12-01')).toEqual([
      '2026-01-31', '2026-03-31', '2026-05-31', '2026-07-31',
    ]);
    expect(expandMonthly('FREQ=MONTHLY;INTERVAL=3', '2026-11-30', '2027-12-01')).toEqual([
      '2026-11-30', '2027-05-30', '2027-08-30', '2027-11-30',
    ]);
  });

  it('counts emitted dates rather than skipped candidate months and respects UNTIL', () => {
    expect(expandMonthly('FREQ=MONTHLY;COUNT=3', '2026-01-31')).toEqual([
      '2026-01-31', '2026-03-31', '2026-05-31',
    ]);
    expect(expandMonthly('FREQ=MONTHLY;UNTIL=2026-03-30', '2026-01-31')).toEqual([
      '2026-01-31',
    ]);
    expect(expandMonthly('FREQ=MONTHLY;UNTIL=2026-03-31', '2026-01-31')).toEqual([
      '2026-01-31', '2026-03-31',
    ]);
    expect(expandMonthly('FREQ=MONTHLY;UNTIL=2026-01-31', '2026-01-31')).toEqual([
      '2026-01-31',
    ]);
  });

  it('generates stable successor dates without monthly drift', () => {
    const dates = ['2026-01-31'];
    for (let index = 0; index < 4; index += 1) {
      dates.push(nextMonthlyOccurrenceISO(dates.at(-1), 1));
    }

    expect(dates).toEqual([
      '2026-01-31', '2026-03-31', '2026-05-31', '2026-07-31', '2026-08-31',
    ]);
  });
});

describe('daily and weekly RRULE expansion', () => {
  it('defaults a weekly rule without BYDAY to the DTSTART weekday', () => {
    expect(expandDatesInRange(
      'FREQ=WEEKLY',
      '2026-07-13',
      '2026-07-13',
      '2026-07-27'
    )).toEqual(['2026-07-13', '2026-07-20', '2026-07-27']);

    expect(expandDatesInRange(
      'FREQ=WEEKLY;INTERVAL=2',
      '2026-07-13',
      '2026-07-13',
      '2026-08-10'
    )).toEqual(['2026-07-13', '2026-07-27', '2026-08-10']);
  });

  it('keeps biweekly cadence across calendar-year boundaries', () => {
    expect(expandDatesInRange(
      'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO',
      '2025-12-29',
      '2025-12-29',
      '2026-02-02'
    )).toEqual(['2025-12-29', '2026-01-12', '2026-01-26']);
  });

  it('applies COUNT to daily and multi-day weekly rules before range filtering', () => {
    expect(expandDatesInRange(
      'FREQ=DAILY;COUNT=3',
      '2026-01-01',
      '2026-01-02',
      '2026-01-10'
    )).toEqual(['2026-01-02', '2026-01-03']);

    expect(expandDatesInRange(
      'FREQ=WEEKLY;BYDAY=MO,WE;COUNT=3',
      '2026-01-05',
      '2026-01-06',
      '2026-01-31'
    )).toEqual(['2026-01-07', '2026-01-12']);
  });
});

describe('RRULE expansion safety', () => {
  it('rejects impossible, malformed, and reversed ranges before iterating', () => {
    expect(isValidISODate('2024-02-29')).toBe(true);
    expect(isValidISODate('2023-02-29')).toBe(false);
    expect(isValidISODate('foo-01')).toBe(false);

    expect(expandDatesInRange('FREQ=MONTHLY', '2024-01-01', 'foo-01', 'foo-NaN')).toEqual([]);
    expect(expandDatesInRange('FREQ=MONTHLY', '2024-02-31', '2024-01-01', '2024-12-31')).toEqual([]);
    expect(expandDatesInRange('FREQ=DAILY', '2024-01-01', '2024-02-01', '2024-01-01')).toEqual([]);
    expect(expandDatesInRange('FREQ=DAILY;UNTIL=not-a-date', '2024-01-01', '2024-01-01', '2024-01-31')).toEqual([]);
  });

  it('caps work for adversarially large recurrence ranges', () => {
    const dates = expandDatesInRange('FREQ=DAILY', '1000-01-01', '1000-01-01', '9999-12-31');

    expect(dates).toHaveLength(MAX_RECURRENCE_ITERATIONS);
  });
});

describe('task recurrence validation', () => {
  it('accepts only the recurrence subset used by task successor generation', () => {
    expect(recurrenceValidationError('FREQ=DAILY;INTERVAL=2;COUNT=4', '2026-07-19')).toBe('');
    expect(recurrenceValidationError('FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=2026-08-19', '2026-07-19')).toBe('');
    expect(recurrenceValidationError('FREQ=MONTHLY', '2026-07-19')).toBe('');
  });

  it('rejects missing dates, unsupported fields, and invalid bounds', () => {
    expect(recurrenceValidationError('FREQ=DAILY', '')).toContain('dueDate');
    expect(recurrenceValidationError('FREQ=YEARLY', '2026-07-19')).toContain('frequency');
    expect(recurrenceValidationError('FREQ=DAILY;BYDAY=MO', '2026-07-19')).toContain('BYDAY');
    expect(recurrenceValidationError('FREQ=DAILY;UNTIL=2026-07-18', '2026-07-19')).toContain('until');
    expect(recurrenceValidationError('FREQ=DAILY;INTERVAL=0', '2026-07-19')).toContain('interval');
    expect(recurrenceValidationError('FREQ=DAILY;COUNT=2;COUNT=3', '2026-07-19')).toContain('duplicate');
  });
});
