import { describe, expect, it } from 'vitest';
import Appointment from '../../models/Appointment.js';

describe('Appointment schema indexes', () => {
  it('applies one-off uniqueness only to appointments with a stored date', () => {
    const index = Appointment.schema.indexes().find(
      ([, options]) => options?.name === 'appointment_one_off_unique_v2',
    );

    expect(index).toEqual([
      { userId: 1, date: 1, timeStart: 1, title: 1 },
      expect.objectContaining({
        unique: true,
        partialFilterExpression: { date: { $type: 'string' } },
      }),
    ]);
    expect(index[1]).not.toHaveProperty('sparse');
  });
});
