export function chooseTodayFocus({
  nextScheduled = null,
  todayTasks = [],
  earlierTasks = [],
  reviewCount = 0,
} = {}) {
  if (nextScheduled) {
    return { kind: 'scheduled', item: nextScheduled };
  }

  if (todayTasks.length > 0) {
    return {
      kind: 'today-task',
      item: todayTasks[0],
      count: todayTasks.length,
    };
  }

  if (earlierTasks.length > 0) {
    return {
      kind: 'earlier-task',
      item: earlierTasks[0],
      count: earlierTasks.length,
    };
  }

  if (reviewCount > 0) {
    return { kind: 'review', count: reviewCount };
  }

  return { kind: 'quiet' };
}
