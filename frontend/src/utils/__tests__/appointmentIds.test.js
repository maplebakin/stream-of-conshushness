import { describe, expect, it } from 'vitest';
import {
  getAppointmentDeleteConfirmation,
  getAppointmentDetailParts,
  getAppointmentTimeLabel,
  getStoredAppointmentId,
  isRecurringAppointment,
  isVirtualRecurringAppointment,
} from '../appointmentIds.js';

describe('appointment identity helpers', () => {
  it.each([null, undefined, false, ''])('is safe for an absent appointment (%s)', (appointment) => {
    expect(getStoredAppointmentId(appointment)).toBe('');
    expect(isVirtualRecurringAppointment(appointment)).toBe(false);
    expect(isRecurringAppointment(appointment)).toBe(false);
    expect(getAppointmentTimeLabel(appointment)).toBe('All day');
    expect(getAppointmentDetailParts(appointment)).toEqual(['All day']);
    expect(getAppointmentDeleteConfirmation(appointment)).toBe('Delete this appointment?');
  });

  it('resolves a virtual occurrence to its stored series id', () => {
    const appointment = { _id: 'virtual:series-123:2026-07-19', isRecurring: true };

    expect(getStoredAppointmentId(appointment)).toBe('series-123');
    expect(isVirtualRecurringAppointment(appointment)).toBe(true);
    expect(getAppointmentDeleteConfirmation(appointment)).toContain('entire series');
  });
});
