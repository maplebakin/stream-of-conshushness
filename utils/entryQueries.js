export function activeEntryQuery(userId) {
  return { userId, deletedAt: null };
}
