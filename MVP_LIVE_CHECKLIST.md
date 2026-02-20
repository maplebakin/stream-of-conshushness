# MVP Live Checklist (v0.1)

## Core daily loop
- [x] Register/login works
- [x] Daily entry creation works
- [x] Create task from entry (`POST /api/tasks/from-entry`)
- [x] Link task to entry (`POST /api/tasks/:id/link-entry`)
- [x] Carry-forward tasks (`POST /api/tasks/carry-forward`)
- [x] Inbox and today task views align with backend filters

## Stability gates
- [x] `npm test` passes
- [x] `npm run build` passes
- [x] Frontend lint has 0 errors (warnings remain)

## Security / operations
- [x] Duplicate compat route mount removed
- [x] Admin reset hardened (auth + rate limit + stronger password floor)
- [x] Shared-secret reset path gated to non-production + explicit flag
- [x] Basic audit logging for admin reset action

## Known limitations for v0.1
- Frontend still has lint warnings (mostly hook deps and Tailwind class order)
- Health endpoint tests are still lightweight and not full integration tests
- Legacy compat routes remain for backward compatibility (intentional)
- Browserslist DB warning during build (`caniuse-lite` is stale)

## Suggested next small wins
1. Clean remaining frontend lint warnings.
2. Add integration tests around `/api/note/:date` shim behavior.
3. Add a simple smoke E2E script for the full daily loop.
