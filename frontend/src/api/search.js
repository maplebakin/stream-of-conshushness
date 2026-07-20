import api from './axiosInstance.js';

export function searchContent(query, type = 'all', limit = 50) {
  return api.get('/search', { params: { q: query, type, limit } });
}

export function completeSearchTask(taskId) {
  return api.patch(`/api/tasks/${taskId}/toggle`, { completed: true });
}
