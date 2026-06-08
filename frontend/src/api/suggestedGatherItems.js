import api from './axiosInstance.js';

function normalizeList(payload) {
  const data = payload?.data ?? payload;
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}

export async function listSuggestedGatherItems(params = {}) {
  const { data } = await api.get('/api/suggested-gather-items', {
    params: { status: 'pending', ...params },
  });
  return normalizeList(data);
}

export async function acceptSuggestedGatherItem(id, payload = {}) {
  const { data } = await api.put(`/api/suggested-gather-items/${id}/accept`, payload);
  return data;
}

export async function rejectSuggestedGatherItem(id) {
  const { data } = await api.put(`/api/suggested-gather-items/${id}/reject`);
  return data;
}
