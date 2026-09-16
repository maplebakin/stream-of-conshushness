const FALLBACK_COLOR = '#9b87f5';
const FALLBACK_ICON = '🗂️';

export function slugifyCluster(value = '') {
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

export function normalizeCluster(raw) {
  if (!raw) return null;
  const id = raw._id || raw.id || null;
  const slugSource = raw.slug || raw.key || '';
  const slug = slugifyCluster(slugSource || (raw.name ?? raw.label ?? ''));
  if (!slug) return null;
  const name = raw.name || raw.label || raw.title || slugSource || 'Untitled cluster';
  return {
    id,
    slug,
    name,
    color: raw.color || FALLBACK_COLOR,
    icon: raw.icon || FALLBACK_ICON,
    createdAt: raw.createdAt || null,
    updatedAt: raw.updatedAt || null
  };
}

export function normalizeClusterList(payload) {
  const data = payload?.data ?? payload;
  const arr = Array.isArray(data)
    ? data
    : Array.isArray(data?.data)
      ? data.data
      : Array.isArray(data?.clusters)
        ? data.clusters
        : Array.isArray(data?.data?.clusters)
          ? data.data.clusters
          : [];
  const list = [];
  for (const raw of arr) {
    const normalized = normalizeCluster(raw);
    if (normalized) list.push(normalized);
  }
  return list;
}

export function clusterIdOf(raw) {
  if (!raw) return '';
  if (typeof raw === 'string') return raw.trim();
  return String(raw._id || raw.id || '').trim();
}

export function primaryClusterReference(entity) {
  const linked = Array.isArray(entity?.clusters) ? entity.clusters : [];
  for (const cluster of linked) {
    const id = clusterIdOf(cluster);
    if (id) return id;
  }
  return typeof entity?.cluster === 'string' ? entity.cluster.trim() : '';
}

export function resolveClusterId(reference, clusters = []) {
  const value = clusterIdOf(reference);
  if (!value) return '';

  const match = (Array.isArray(clusters) ? clusters : []).find((cluster) => {
    const id = clusterIdOf(cluster);
    const slug = String(cluster?.slug || '').trim();
    const name = String(cluster?.name || '').trim();
    return id === value || slug === value || name === value;
  });

  return clusterIdOf(match);
}
