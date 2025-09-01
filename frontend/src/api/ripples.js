import api from './axiosInstance.js';

export async function getRipplesForDay(dateISO, opts = {}) {
  const params = { date: dateISO, ...(opts.status ? { status: opts.status } : {}), ...(opts.cluster ? { cluster: opts.cluster } : {}) };
  const { data } = await api.get('/api/ripples', { params });
  return data;
}

export async function getPendingRipples() {
  const { data } = await api.get('/api/ripples', { params: { status: 'pending' } });
  return data;
}

export async function approveRipple(id) {
  const { data } = await api.post(`/api/ripples/${id}/approve`);
  return data;
}

export async function dismissRipple(id) {
  const { data } = await api.post(`/api/ripples/${id}/dismiss`);
  return data;
}

/**
 * Robust analyzer:
 *   analyzeEntry(entryId, { text, date })
 *   analyzeEntry({ entryId?, text, date? })
 * Backend requires top-level `text` string.
 */
export async function analyzeEntry(arg1, arg2) {
  let payload;
  if (arg1 && typeof arg1 === 'object' && !arg2) {
    payload = arg1; // { entryId?, text, date? }
  } else {
    payload = { entryId: arg1, ...(arg2 || {}) }; // legacy shape
  }
  if (!payload || typeof payload.text !== 'string' || payload.text.trim() === '') {
    throw new Error('analyzeEntry: text (string) is required');
  }
  const { data } = await api.post('/api/ripples/analyze', payload);
  return data;
}

export const fetchRipplesForDate = getRipplesForDay;
export const fetchPendingRipples = getPendingRipples;
