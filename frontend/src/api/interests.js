import api from './axiosInstance.js';

function normalizeList(payload) {
  const data = payload?.data ?? payload;
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}

export async function listInterests(params = {}) {
  const { data } = await api.get('/api/interests', { params });
  return normalizeList(data);
}

export async function createInterest(payload) {
  const { data } = await api.post('/api/interests', payload);
  return data;
}

export async function updateInterest(id, payload) {
  const { data } = await api.patch(`/api/interests/${id}`, payload);
  return data;
}

export async function updateInterestStatus(id, status) {
  return updateInterest(id, { status });
}

export async function deleteInterest(id) {
  const { data } = await api.delete(`/api/interests/${id}`);
  return data;
}
