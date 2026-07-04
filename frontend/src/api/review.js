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
