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
  return api.patch(`/api/appointments/${appointmentId}/review`, { action: 'keep' });
}

export function dismissCalendarAppointment(appointmentId) {
  return api.patch(`/api/appointments/${appointmentId}/review`, { action: 'dismiss' });
}

export function keepCalendarEvent(eventId) {
  return api.patch(`/api/important-events/${eventId}/review`, { action: 'keep' });
}

export function dismissCalendarEvent(eventId) {
  return api.patch(`/api/important-events/${eventId}/review`, { action: 'dismiss' });
}

export function acceptScheduleSuggestion(suggestionId, changes) {
  return api.put(`/api/suggested-schedules/${suggestionId}/accept`, { changes });
}

export function rejectScheduleSuggestion(suggestionId) {
  return api.put(`/api/suggested-schedules/${suggestionId}/reject`, {});
}
