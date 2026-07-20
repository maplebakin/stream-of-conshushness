import { describe, expect, it } from 'vitest';
import { appointmentValidationError, initialAppointmentRepeat } from '../appointmentRepeat.js';

describe('appointment repeat editor', () => {
  it('preserves DTSTART weekday semantics when a weekly rule omits BYDAY', () => {
    expect(initialAppointmentRepeat({
      startDate: '2026-07-15',
      rrule: 'FREQ=WEEKLY;INTERVAL=1',
    }).byday).toEqual([]);
  });

  it('retains explicit weekly day selections', () => {
    expect(initialAppointmentRepeat({ rrule: 'FREQ=WEEKLY;BYDAY=WE,FR' }).byday).toEqual(['WE', 'FR']);
  });

  it('rejects backwards times and recurrence ranges before submission', () => {
    expect(appointmentValidationError({
      title: 'Doctor',
      date: '2026-07-19',
      timeStart: '15:00',
      timeEnd: '14:00',
    })).toContain('End time');

    expect(appointmentValidationError({
      title: 'Therapy',
      repeatOn: true,
      startDate: '2026-07-19',
      until: '2026-07-18',
    })).toContain('Until date');
  });

  it('accepts valid one-off and recurring appointment forms', () => {
    expect(appointmentValidationError({
      title: 'Doctor',
      date: '2026-07-19',
      timeStart: '10:00',
      timeEnd: '10:30',
    })).toBe('');
    expect(appointmentValidationError({
      title: 'Therapy',
      repeatOn: true,
      startDate: '2026-07-19',
      until: '2026-08-19',
    })).toBe('');
  });
});
