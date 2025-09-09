import api from './axiosInstance.js';

export async function listTasks(params) {
  const { data } = await api.get('/api/tasks', { params });
  return data;
}

export async function toggleTask(id) {
  // backend expects PATCH /api/tasks/:id/toggle
  const { data } = await api.patch(`/api/tasks/${id}/toggle`);
  return data;
}

export async function completeTask(id) {
  return toggleTask(id);
}

export async function carryForward({ from, to, cluster } = {}) {
  // optional route; no-op if missing on backend
  const { data } = await api.post('/api/tasks/carry-forward', { from, to, cluster });
  return data;
}

export async function linkTaskToEntry(id, entryId) {
  const { data } = await api.post(`/api/tasks/${id}/link-entry`, { entryId });
  return data;
}

export async function unlinkTaskFromEntry(id) {
  const { data } = await api.post(`/api/tasks/${id}/unlink-entry`);
  return data;
}

export async function createTask(payload) {
  const { data } = await api.post('/api/tasks', payload);
  return data;
}

export async function deleteTask(id) {
  const { data } = await api.delete(`/api/tasks/${id}`);
  return data;
}

export async function bulkDeleteTasks(ids = []) {
  const { data } = await api.post('/api/tasks/bulk-delete', { ids });
  return data;
}
