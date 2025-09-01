// frontend/src/api/entries.js
import api from "./axiosInstance.js";

// List with optional filters: { date, cluster, section, sectionPageId, limit }
export async function listEntries(params) {
  const { data } = await api.get("/api/entries", { params });
  return data;
}

// Single by ID
export async function getEntry(id) {
  const { data } = await api.get(`/api/entries/${id}`);
  return data;
}

// Convenience: get by date (uses new backend route)
export async function getEntriesByDate(dateISO) {
  const { data } = await api.get(`/api/entries/by-date/${dateISO}`);
  return data;
}

export async function createEntry(payload) {
  const { data } = await api.post("/api/entries", payload);
  return data;
}

export async function updateEntry(id, payload) {
  const { data } = await api.patch(`/api/entries/${id}`, payload);
  return data;
}

export async function removeEntry(id) {
  const { data } = await api.delete(`/api/entries/${id}`);
  return data;
}
