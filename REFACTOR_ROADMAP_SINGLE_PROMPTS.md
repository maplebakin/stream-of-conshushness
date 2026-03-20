# Refactor Roadmap (Single-Message Prompts)

## Phase 1: Unblock CI and release gates
You are working in this repository. Fix production gate failures so CI can pass with a deterministic baseline.

Goals:
- Make `npm test` pass.
- Make `cd frontend && npm run lint` pass.
- Keep behavior changes minimal in this phase (stability over feature work).

Required changes:
- Resolve mixed test runner mismatch: files under `utils/__tests__` currently use `node:test` but run under Vitest; convert those tests to Vitest syntax or adjust Vitest include/exclude so test execution is coherent.
- Fix all current frontend lint errors (not just warnings):
  - `frontend/src/TaskList.jsx` missing `useEffect` import.
  - `frontend/src/ThemeContext.jsx` and `frontend/src/ToastContext.jsx` react-refresh violations.
  - `frontend/src/components/ThemeToggle.jsx` unused `theme` variable.
  - `frontend/src/pages/GlobalSearch.jsx` unused `useCallback` import.
- Do not silence errors by disabling rules globally.

Constraints:
- Keep edits scoped to failing files and config.
- Do not add unrelated refactors.

Verification commands to run and report:
1) `npm test`
2) `cd frontend && npm run lint`
3) `cd frontend && npm run build`

Deliver:
- A concise summary of changed files and why.
- Command outputs summary (pass/fail + key lines).

## Phase 2: Fix split-brain task API flows (canonicalize on /api/tasks)
You are working in this repository. Eliminate task-flow endpoint drift between frontend calls and backend route mounts.

Context:
- Frontend calls `/api/tasks/carry-forward`, `/api/tasks/from-entry`, and `/api/tasks/:id/link-entry`.
- Backend currently defines legacy versions in `routes/compat.js`, mounted under `/routes`, not `/api`.
- This creates production 404s and silent failures.

Goals:
- Implement canonical task endpoints in `routes/tasks.js` under `/api/tasks` for:
  - `POST /carry-forward`
  - `POST /from-entry`
  - `POST /:id/link-entry`
- Ensure these endpoints are user-scoped and compatible with existing frontend payloads.
- Keep legacy compat routes temporarily but make them delegate to canonical logic (or mark deprecated with clear comments).

Implementation requirements:
- Reuse existing helpers for user ID and date normalization where possible.
- For `carry-forward`, support default today→tomorrow behavior and explicit `{ from, to }` input.
- For `from-entry`, enforce ownership of source entry and create task with safe defaults.
- For `link-entry`, link by entry ID when available or by date with optional create behavior.
- Add route tests covering success + auth + invalid input + ownership checks.

Verification commands to run and report:
1) `npm test`
2) `node scripts/backend_sanity.mjs` (or equivalent route smoke command)

Deliver:
- Changed files with rationale.
- API contract notes for each new canonical endpoint.
- Any deprecated compat paths listed explicitly.

## Phase 3: Align frontend task clients with backend contract
You are working in this repository. Align frontend task consumers with the canonical backend query/field contract.

Goals:
- Remove assumptions that backend supports unsupported query params or fields.
- Make inbox/count/today toggles produce correct data.

Implementation requirements:
- Audit `frontend/src/api/tasks.js`, `frontend/src/hooks/useTasks.js`, `frontend/src/TaskList.jsx`, and any backlog/inbox components.
- Replace unsupported query params (`view`, `countOnly`, `includeOverdue`, `includeRecurring` if not server-supported) with supported server filters, or implement corresponding backend support if keeping them is required.
- Standardize recurrence field usage (`rrule` vs `repeat`) across UI logic and rendering.
- Ensure query invalidation keys match react-query v5 object-style usage.
- Add UI-safe error handling for task mutation failures currently swallowed.

Verification commands to run and report:
1) `cd frontend && npm run lint`
2) `cd frontend && npm run build`
3) `npm test`

Deliver:
- Exact API/query contract mapping frontend->backend after refactor.
- Files changed and user-visible behavior changes.

## Phase 4: Harden auth/admin/reset and production safety rails
You are working in this repository. Reduce high-risk auth surface and operational hazards.

Goals:
- Harden privileged password-reset flows.
- Ensure startup/build paths are production-safe and predictable.

Implementation requirements:
- Review and secure `POST /api/admin/reset-password` and related admin reset flows in `routes/auth.js` and `routes/admin.js`:
  - Add strict rate limiting and audit logging.
  - Ensure least-privilege access model (prefer authenticated admin path over shared secret endpoint).
  - If shared-secret route must remain, gate it behind explicit non-production or internal-only controls.
- Remove duplicate router mounts and dead path ambiguity in `server.js` (e.g., duplicate compat mount).
- Update root `build` script so CI does not reinstall dependencies during build; keep installs in install step.
- Add tests for hardened auth/admin behavior and negative cases.

Verification commands to run and report:
1) `npm test`
2) `npm run build`
3) `cd frontend && npm run lint`

Deliver:
- Threat-focused summary of what was hardened.
- Backward compatibility notes.

## Phase 5: Expand production confidence with targeted coverage
You are working in this repository. Add tests for critical production flows currently unguarded.

Goals:
- Add high-value tests for routes and behaviors that can regress silently.

Required coverage additions:
- Integration-style route tests for:
  - Task carry-forward, from-entry, link-entry.
  - Notes date shim behavior (`/api/note/:date`) and plural/singular path consistency.
  - Export streaming mode and large dataset handling (mocked cursor).
- Startup and health behavior:
  - Health response semantics for Mongo connection state.
- Frontend smoke tests (if test framework available) for task list critical interactions.

Constraints:
- Prefer deterministic, isolated tests with explicit mocks.
- Focus on regression-preventing assertions, not snapshot noise.

Verification commands to run and report:
1) `npm test -- --coverage` (or `npm run test:coverage`)
2) `npm run build`
3) `cd frontend && npm run lint`

Deliver:
- Coverage delta summary.
- Remaining known risks and why they were deferred.
