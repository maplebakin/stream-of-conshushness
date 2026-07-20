export function isISODate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function taskMatchesScope(task, scope, { today, routeDate = '' } = {}) {
  const dueDate = task?.dueDate || '';
  const completed = Boolean(task?.completed);

  if (scope === 'all') return true;
  if (scope === 'date') return !completed && isISODate(routeDate) && dueDate === routeDate;
  if (scope === 'active') return !completed;
  if (scope === 'overdue') return !completed && isISODate(dueDate) && dueDate < today;
  if (scope === 'today') return !completed && dueDate === today;
  if (scope === 'upcoming') return !completed && isISODate(dueDate) && dueDate > today;
  if (scope === 'nodate') return !completed && !dueDate;
  if (scope === 'fromEntries') return !completed && Boolean(task?.entryId);
  if (scope === 'completed') return completed;
  return true;
}

export function taskCreatePayload(title, routeDate = '') {
  const payload = { title: String(title || '').trim() };
  if (isISODate(routeDate)) payload.dueDate = routeDate;
  return payload;
}
