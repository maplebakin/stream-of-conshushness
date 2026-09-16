import { describe, expect, it, vi } from 'vitest';
import { carryOverdueTasks, dailyPreferenceKey, overdueDueDates } from '../carryForward.js';

describe('carry overdue tasks', () => {
  it('scopes automatic carry-forward preferences and run markers to one account', () => {
    expect(dailyPreferenceKey('user-a', 'auto-carry')).not.toBe(
      dailyPreferenceKey('user-b', 'auto-carry')
    );
    expect(dailyPreferenceKey('', 'auto-carry')).toBe('');
  });

  it('selects unique incomplete dates before the target without including the target day', () => {
    expect(overdueDueDates([
      { dueDate: '2026-07-10', completed: false },
      { dueDate: '2026-07-10', completed: false },
      { dueDate: '2026-07-11', completed: true },
      { dueDate: '2026-07-12', completed: false },
      { dueDate: '2026-07-13', completed: false },
    ], '2026-07-12')).toEqual(['2026-07-10']);
  });

  it('moves each overdue date into the target date with explicit backend payloads', async () => {
    const api = {
      get: vi.fn().mockResolvedValue({
        data: {
          dueToday: [
            { dueDate: '2026-07-09', completed: false },
            { dueDate: '2026-07-11', completed: false },
            { dueDate: '2026-07-12', completed: false },
          ],
        },
      }),
      post: vi.fn()
        .mockResolvedValueOnce({ data: { moved: 2 } })
        .mockResolvedValueOnce({ data: { moved: 1 } }),
    };

    await expect(carryOverdueTasks(api, '2026-07-12')).resolves.toEqual({
      from: ['2026-07-09', '2026-07-11'],
      to: '2026-07-12',
      moved: 3,
    });
    expect(api.post).toHaveBeenNthCalledWith(1, '/api/tasks/carry-forward', {
      from: '2026-07-09',
      to: '2026-07-12',
    });
    expect(api.post).toHaveBeenNthCalledWith(2, '/api/tasks/carry-forward', {
      from: '2026-07-11',
      to: '2026-07-12',
    });
  });
});
