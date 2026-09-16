import { beforeEach, describe, expect, it, vi } from 'vitest';

const find = vi.hoisted(() => vi.fn());

vi.mock('../../models/Appointment.js', () => ({
  default: { find },
}));

import { appointmentInstancesInRange } from '../calendarInstances.js';

describe('recurring appointment instances', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('expands month-end series without overflow and preserves provenance metadata', async () => {
    find
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{
        _id: 'series-1',
        title: 'Month end review',
        startDate: '2026-01-31',
        rrule: 'FREQ=MONTHLY',
        until: '2026-08-31',
        timeStart: '09:00',
        entryId: 'entry-1',
        source: 'entry-automation',
        userId: 'user-1',
      }]);

    const instances = await appointmentInstancesInRange('user-1', '2026-01-01', '2026-09-01');

    expect(instances.map((instance) => instance.date)).toEqual([
      '2026-01-31', '2026-03-31', '2026-05-31', '2026-07-31', '2026-08-31',
    ]);
    expect(instances).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ date: '2026-03-03' }),
    ]));
    expect(new Set(instances.map((instance) => instance.date)).size).toBe(instances.length);
    expect(instances[0]).toMatchObject({
      isRecurring: true,
      seriesId: 'series-1',
      entryId: 'entry-1',
      source: 'entry-automation',
    });
  });
});
