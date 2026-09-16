/**
 * Wait for every declared Mongoose index before production begins accepting
 * requests. Retry/idempotency guarantees rely on database uniqueness, not
 * merely on application-level preflight queries.
 *
 * Model.init() creates missing declared indexes but does not drop unrelated
 * indexes. A duplicate-data or permissions failure rejects startup visibly.
 */
export async function initializeDeclaredIndexes(mongooseInstance) {
  const names = mongooseInstance.modelNames();
  await Promise.all(names.map((name) => mongooseInstance.model(name).init()));
  return names;
}
