import { describe, expect, it } from 'vitest';
import { chooseTodayFocus } from '../../frontend/src/utils/todayFocus.js';

describe('Today focus priority', () => {
  const scheduled = { _id: 'appointment-1', title: 'Dentist', time: '10:00' };
  const todayTask = { _id: 'task-today', title: 'Send the form', dueDate: '2026-07-19' };
  const earlierTask = { _id: 'task-earlier', title: 'Call the school', dueDate: '2026-07-18' };

  it('prioritizes the next scheduled item over tasks and review', () => {
    expect(chooseTodayFocus({
      nextScheduled: scheduled,
      todayTasks: [todayTask],
      earlierTasks: [earlierTask],
      reviewCount: 3,
    })).toEqual({ kind: 'scheduled', item: scheduled });
  });

  it('prioritizes a task due on the selected day over earlier tasks', () => {
    expect(chooseTodayFocus({
      todayTasks: [todayTask],
      earlierTasks: [earlierTask],
      reviewCount: 3,
    })).toEqual({ kind: 'today-task', item: todayTask, count: 1 });
  });

  it('turns earlier tasks into a compact review focus', () => {
    expect(chooseTodayFocus({
      earlierTasks: [earlierTask, { ...earlierTask, _id: 'task-earlier-2' }],
    })).toMatchObject({ kind: 'earlier-task', count: 2, item: earlierTask });
  });

  it('uses review when there is no scheduled or task action', () => {
    expect(chooseTodayFocus({ reviewCount: 2 })).toEqual({ kind: 'review', count: 2 });
  });

  it('returns one quiet state when nothing requires attention', () => {
    expect(chooseTodayFocus()).toEqual({ kind: 'quiet' });
  });
});
