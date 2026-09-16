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
- [x] Frontend lint has 0 errors and 0 warnings
- [x] `npm run verify` runs local CI-equivalent checks
- [x] `npm run test:daily-loop` covers entry -> suggestion -> task -> carry-forward
- [x] Unified Review Inbox surfaces pending automation artifacts in one workflow

## Security / operations
- [x] Duplicate compat route mount removed
- [x] Admin reset hardened (auth + rate limit + stronger password floor)
- [x] Shared-secret reset path gated to non-production + explicit flag
- [x] Basic audit logging for admin reset action

## Known limitations for v0.1
- Health endpoint tests are still lightweight and not full integration tests
- Legacy compat routes remain for backward compatibility (intentional)
- Route audit script still reports noisy false positives for auth aliases and parameterized routes

## Suggested next small wins
1. Refine `scripts/routeAudit.mjs` until it can become a CI gate.
2. Add integration tests around `/api/note/:date` shim behavior.
3. Add bulk accept/reject actions to the unified Review Inbox after real-world use shows which actions are safe to batch.
