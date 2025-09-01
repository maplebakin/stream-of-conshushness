import api from './axiosInstance.js';


export async function listTasks(params) {
const { data } = await api.get('/api/tasks', { params });
return data;
}


export async function toggleTask(id) {
const { data } = await api.post(`/api/tasks/${id}/toggle`);
return data;
}


export async function completeTask(id) {
// If your backend only has /toggle, we still expose complete for old callers
return toggleTask(id);
}


export async function carryForward({ from, to, cluster }) {
// Use canonical if you add it later; otherwise keep this helper here
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
