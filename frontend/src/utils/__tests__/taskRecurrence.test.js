import { describe, expect, it } from 'vitest';
import { taskRecurrenceLabel } from '../taskRecurrence.js';

describe('task recurrence labels', () => {
  it('uses the canonical rrule when one is present', () => {
    expect(taskRecurrenceLabel({
      rrule: 'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,FR',
      repeat: { unit: 'month', interval: 1 },
    })).toBe('Every 2 weeks on MO, FR');
  });

  it('keeps legacy repeat records understandable', () => {
    expect(taskRecurrenceLabel({ repeat: { unit: 'month', interval: 2 } }))
      .toBe('Every 2 months');
  });

  it('returns no label for a non-recurring task', () => {
    expect(taskRecurrenceLabel({})).toBe('');
  });
});
