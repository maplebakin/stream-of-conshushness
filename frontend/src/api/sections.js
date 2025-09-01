import api from './axiosInstance.js';


export async function listSections(params) {
const { data } = await api.get('/api/sections', { params });
return data;
}


export async function getSection(key) {
const { data } = await api.get(`/api/sections/${encodeURIComponent(key)}`);
return data;
}


export async function createSection(payload) {
const { data } = await api.post('/api/sections', payload);
return data;
}


export async function updateSection(id, payload) {
const { data } = await api.patch(`/api/sections/${id}`, payload);
return data;
}


export async function deleteSection(id) {
const { data } = await api.delete(`/api/sections/${id}`);
return data;
}