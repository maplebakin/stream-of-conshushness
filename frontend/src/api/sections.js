import api from './axiosInstance.js';

function normalize(response) {
  if (!response) return null;
  const data = Array.isArray(response.data) || typeof response.data === 'object'
    ? response.data
    : response;
  return data;
}

export async function listSections(params = {}) {
  const res = await api.get('/api/sections', { params });
  return normalize(res);
}

export async function getSection(key) {
  const res = await api.get(`/api/sections/${encodeURIComponent(key)}`);
  return normalize(res);
}

export async function createSection(payload) {
  const res = await api.post('/api/sections', payload);
  return normalize(res);
}

export async function updateSection(id, payload) {
  const res = await api.patch(`/api/sections/${encodeURIComponent(id)}`, payload);
  return normalize(res);
}

export async function deleteSection(id) {
  await api.delete(`/api/sections/${encodeURIComponent(id)}`);
  return true;
}

export default {
  listSections,
  getSection,
  createSection,
  updateSection,
  deleteSection,
};
