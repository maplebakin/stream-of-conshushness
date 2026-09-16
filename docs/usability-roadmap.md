# Usability Roadmap

Last updated: 2026-07-07

This backlog turns the audit findings into implementation themes. Keep this file current as cleanup work lands so old audit artifacts do not drift away from the app.

## Primary Daily Loop

1. Capture naturally in Stream or Today.
2. Review extracted items in the unified Review Inbox.
3. Plan tasks, appointments, and schedule blocks from Today.
4. Act from Today without needing to visit every feature page.
5. Recover safely through undo and Trash.

## Current Priorities

- Make `/review` the default triage surface for pending automation artifacts.
- Keep accepted object pages focused on managing accepted work: Tasks, Gather, Interests, and Ripples.
- Use original-record restore for undo after soft delete.
- Consolidate notifications through `react-hot-toast`.
- Reduce initial frontend bundle size with route-level lazy loading.
- Keep destructive actions on app-native inline confirmations instead of browser dialogs.
- Retire compatibility shims only after route tests and current frontend callers prove they are no longer needed.

## Recently Landed

- Review Inbox supports edit-before-accept for task, gather, and interest suggestions.
- Review Inbox supports selected bulk accept/keep and reject/dismiss actions.
- Review Inbox shows source text or source-entry excerpts and includes source context in search.
- Sidebar review count makes pending automation visible from the main navigation.
- Active routed pages no longer use browser-native confirm/alert/prompt for common daily actions.
- Review Inbox accepted/kept items now show short follow-up links to the relevant destination.
- Stream and Today show pending Review Inbox counts.
- Search results expose direct actions for opening results, completing tasks, and routing suggestions to review.
- The unreachable legacy `ManageSections` page was removed; adapter mocks no longer use browser alerts.
- A shared `ConfirmButton` exists for simple two-step confirmations and is used by simple delete flows.

## Next Product Improvements

- Add one consistent confirmation modal for flows that need more detail than a two-step inline button.
- Add a focused end-to-end smoke test for Stream capture -> Review Inbox -> accept -> object page.
- Extend Search actions beyond open/complete/review to edit, restore, and delete where the result type has a safe existing API.
- Continue migrating bespoke local confirmation state to `ConfirmButton` when touching those files.

## Cleanup Candidates

- Move large inline styles into page CSS files or shared design primitives.
- Normalize auth helper usage around `AuthContext` and `axiosInstance`.
- Audit legacy API aliases in `server.js` and `routes/compat.js` against real frontend usage.
- Remove legacy model files after migration tests confirm they are unused.
