import api from './axiosInstance.js';

function normalizeList(payload) {
  const data = payload?.data ?? payload;
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}

export async function listGatherItems(params = {}) {
  const { data } = await api.get('/api/gather-items', { params });
  return normalizeList(data);
}

export async function createGatherItem(payload) {
  const { data } = await api.post('/api/gather-items', payload);
  return data;
}

export async function updateGatherItem(id, payload) {
  const { data } = await api.patch(`/api/gather-items/${id}`, payload);
  return data;
}

export async function updateGatherItemStatus(id, status) {
  return updateGatherItem(id, { status });
}

export async function deleteGatherItem(id) {
  const { data } = await api.delete(`/api/gather-items/${id}`);
  return data;
}
