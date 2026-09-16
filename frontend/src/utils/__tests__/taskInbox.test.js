import { describe, expect, it } from 'vitest';
import { taskCreatePayload, taskMatchesScope } from '../taskInbox.js';

describe('date-scoped task inbox', () => {
  it('shows only incomplete tasks scheduled for the route date', () => {
    const context = { today: '2026-07-12', routeDate: '2026-07-15' };
    expect(taskMatchesScope({ dueDate: '2026-07-15', completed: false }, 'date', context)).toBe(true);
    expect(taskMatchesScope({ dueDate: '2026-07-15', completed: true }, 'date', context)).toBe(false);
    expect(taskMatchesScope({ dueDate: '2026-07-14', completed: false }, 'date', context)).toBe(false);
  });

  it('schedules quick-added tasks for a valid route date', () => {
    expect(taskCreatePayload('  Plan trip  ', '2026-07-15')).toEqual({
      title: 'Plan trip',
      dueDate: '2026-07-15',
    });
    expect(taskCreatePayload('Plan trip', 'not-a-date')).toEqual({ title: 'Plan trip' });
  });
});
