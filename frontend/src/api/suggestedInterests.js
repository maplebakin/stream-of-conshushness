import api from './axiosInstance.js';

function normalizeList(payload) {
  const data = payload?.data ?? payload;
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}

export async function listSuggestedInterests(params = {}) {
  const { data } = await api.get('/api/suggested-interests', {
    params: { status: 'pending', ...params },
  });
  return normalizeList(data);
}

export async function acceptSuggestedInterest(id, payload = {}) {
  const { data } = await api.put(`/api/suggested-interests/${id}/accept`, payload);
  return data;
}

export async function rejectSuggestedInterest(id) {
  const { data } = await api.put(`/api/suggested-interests/${id}/reject`);
  return data;
}
