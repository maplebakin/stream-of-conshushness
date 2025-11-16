export function isClustered(entry) {
  if (!entry) return false;
  const legacy = entry.cluster;
  const hasLegacy = typeof legacy === 'string'
    ? legacy.trim().length > 0
    : Boolean(legacy);
  const clusterList = Array.isArray(entry.clusters) ? entry.clusters : [];
  const hasMulti = clusterList.some(item => {
    if (item == null) return false;
    if (typeof item === 'string') return item.trim().length > 0;
    return true;
  });
  return hasLegacy || hasMulti;
}
