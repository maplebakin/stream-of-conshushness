import { describe, expect, it } from 'vitest';
import {
  appointmentOneOffIndexPlan,
  APPOINTMENT_ONE_OFF_INDEX_KEY,
  APPOINTMENT_ONE_OFF_INDEX_OPTIONS,
} from '../../scripts/migrations/replaceAppointmentOneOffIndex.mjs';

describe('Appointment one-off index migration', () => {
  it('recognizes the partial replacement and legacy sparse index independently', () => {
    const legacy = {
      name: 'userId_1_date_1_timeStart_1_title_1',
      key: APPOINTMENT_ONE_OFF_INDEX_KEY,
      unique: true,
      sparse: true,
    };

    expect(appointmentOneOffIndexPlan([legacy])).toEqual({
      desiredPresent: false,
      legacyIndexNames: ['userId_1_date_1_timeStart_1_title_1'],
    });
    expect(appointmentOneOffIndexPlan([
      legacy,
      {
        name: APPOINTMENT_ONE_OFF_INDEX_OPTIONS.name,
        key: APPOINTMENT_ONE_OFF_INDEX_KEY,
        unique: true,
        partialFilterExpression: APPOINTMENT_ONE_OFF_INDEX_OPTIONS.partialFilterExpression,
      },
    ])).toEqual({
      desiredPresent: true,
      legacyIndexNames: ['userId_1_date_1_timeStart_1_title_1'],
    });
  });
});
