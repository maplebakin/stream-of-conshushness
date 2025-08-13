// api/tasks.js

const BASE = '/api/tasks';

/* Build headers with JWT */
export function authHeaders(token) {
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/* GET /api/tasks?includeEntries=1&completed=0&cluster=home&date=YYYY-MM-DD
   Tip: for the Daily page, call with { completed: false } and omit `date`
   so you can group Carry Forward / Today / Upcoming on the client. */
export async function fetchTasks({ token, includeEntries = true, completed, cluster, date } = {}) {
  const qs = new URLSearchParams();
  if (includeEntries) qs.set('includeEntries', '1');
  if (completed != null) qs.set('completed', completed ? '1' : '0');
  if (cluster) qs.set('cluster', cluster);
  if (date) qs.set('date', date);

  const res = await fetch(`${BASE}?${qs.toString()}`, { headers: authHeaders(token) });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || 'Failed to load tasks');
  return data;
}

/* POST /api/tasks */
export async function createTask({ token, body }) {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || 'Failed to create task');
  return data;
}

/* PATCH /api/tasks/:id */
export async function updateTask({ token, id, patch }) {
  const res = await fetch(`${BASE}/${id}`, {
    method: 'PATCH',
    headers: authHeaders(token),
    body: JSON.stringify(patch),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || 'Failed to update task');
  return data;
}

/* POST /api/tasks/:id/link-entry */
export async function linkTaskEntry({ token, id, entryId }) {
  const res = await fetch(`${BASE}/${id}/link-entry`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ entryId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || 'Failed to link entry');
  return data;
}

/* POST /api/tasks/:id/unlink-entry */
export async function unlinkTaskEntry({ token, id, entryId }) {
  const res = await fetch(`${BASE}/${id}/unlink-entry`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ entryId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || 'Failed to unlink entry');
  return data;
}

/* POST /api/tasks/carry-forward */
export async function carryForwardAll({ token }) {
  const res = await fetch(`${BASE}/carry-forward`, {
    method: 'POST',
    headers: authHeaders(token),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || 'Carry-forward failed');
  return data;
}
