function isISODate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function dailyPreferenceKey(userId, preference) {
  const owner = String(userId || '').trim();
  const name = String(preference || '').trim();
  if (!owner || !name) return '';
  return `streamofconshushness:${encodeURIComponent(owner)}:daily:${encodeURIComponent(name)}`;
}

export function overdueDueDates(tasks = [], targetDate) {
  if (!isISODate(targetDate)) return [];

  return [...new Set(
    (Array.isArray(tasks) ? tasks : [])
      .filter((task) => !task?.completed && isISODate(task?.dueDate) && task.dueDate < targetDate)
      .map((task) => task.dueDate)
  )].sort();
}

export async function carryOverdueTasks(api, targetDate) {
  if (!api?.get || !api?.post) throw new Error('An API client is required.');
  if (!isISODate(targetDate)) throw new Error('A target date in YYYY-MM-DD format is required.');

  const { data } = await api.get(`/api/tasks/day/${encodeURIComponent(targetDate)}`);
  const sources = overdueDueDates(data?.dueToday, targetDate);
  const results = await Promise.all(
    sources.map((from) => api.post('/api/tasks/carry-forward', { from, to: targetDate }))
  );

  return {
    from: sources,
    to: targetDate,
    moved: results.reduce((sum, result) => sum + (Number(result?.data?.moved) || 0), 0),
  };
}
