import api from './axiosInstance.js';

function normalizeReviewPayload(payload) {
  const data = payload?.data ?? payload;
  const items = Array.isArray(data?.items) ? data.items : [];
  const counts = data?.counts && typeof data.counts === 'object' ? data.counts : {};
  return { counts, items };
}

export async function listReviewItems(params = {}) {
  const { data } = await api.get('/api/review', { params });
  return normalizeReviewPayload(data);
}

export function moveTaskToDate(taskId, dueDate) {
  return api.patch(`/api/tasks/${taskId}`, { dueDate });
}

export function acceptSuggestedTask(suggestionId, payload = {}) {
  return api.put(`/api/suggested-tasks/${suggestionId}/accept`, payload);
}

export function rejectSuggestedTask(suggestionId) {
  return api.put(`/api/suggested-tasks/${suggestionId}/reject`, {});
}

export function keepCalendarAppointment(appointmentId) {
  return api.patch(`/api/appointments/${appointmentId}`, {});
}

export function dismissCalendarAppointment(appointmentId) {
  return api.delete(`/api/appointments/${appointmentId}`);
}

export function keepCalendarEvent(eventId, pinned) {
  return api.patch(`/api/important-events/${eventId}`, { pinned: !!pinned });
}

export function dismissCalendarEvent(eventId) {
  return api.delete(`/api/important-events/${eventId}`);
}
