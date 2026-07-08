# Current Status of Project

Last updated: 2026-07-08
Branch observed: `codex/review-inbox-maintenance`
Latest observed commit: `7c5367f Improve review inbox usability`

This document is written as a handoff for another LLM or collaborator to brainstorm product and engineering improvements from the current codebase. It summarizes the live architecture, known usable surfaces, recent improvements, open risks, and high-value next directions. It is based on source inspection, existing docs, and the current test/build tooling; it is not a substitute for a fresh manual smoke test with real data.

## One-Sentence Product Shape

Stream of Conshushness is a personal operating system for journal-first productivity: users capture natural-language entries, automation extracts reviewable tasks/gather items/interests/ripples/calendar artifacts, and the app helps them plan and act through Today, Review Inbox, Calendar, Sections, Clusters, and supporting management pages.

## Current Technical Shape

- Backend: Node.js, Express, native ES modules, MongoDB/Mongoose.
- Frontend: React 19, React Router 7, Vite, TipTap, standard CSS plus some Tailwind utilities.
- Auth: JWT via `middleware/auth.js`, frontend `AuthContext`, and shared `frontend/src/api/axiosInstance.js`.
- Main backend entry: `server.js`.
- Backend domains: `routes/`, `models/`, `utils/`, `services/`.
- Main frontend router: `frontend/src/App.jsx`.
- Main authenticated shell: `frontend/src/Layout.jsx` plus `Header.jsx`.
- Current verification scripts:
  - `npm test`
  - `npm --prefix frontend run lint`
  - `npm run build`
  - `npm run check:no-glob`
  - `npm run verify` includes audits plus dependency audits.

## Current Feature Map

Primary app routes:

- `/` Stream capture/feed.
- `/today` redirects to `/day/YYYY-MM-DD`.
- `/day/:date` daily planning and acting surface.
- `/review` unified review inbox for pending automation artifacts.
- `/calendar` month/calendar surface.
- `/inbox/tasks` and `/inbox/tasks/:date` task inbox.
- `/gather-lists` accepted gather items plus pending gather suggestions.
- `/interests` accepted interests plus pending interest suggestions.
- `/ripples` ripple review.
- `/sections`, `/sections/:key`, `/sections/:sectionSlug/:pageSlug`, `/sections/:sectionSlug/:pageSlug/:tab`.
- `/clusters`, `/clusters/:clusterSlug`.
- `/goals`, `/habits/analytics`, `/search`, `/trash`, `/export`, `/account`, `/settings`, `/admin`.
- Public auth routes: `/login`, `/register`, `/forgot`, `/reset`.

Major backend route groups:

- Auth: `/api`, `/api/auth`.
- Entries: `/api/entries`.
- Tasks: `/api/tasks`.
- Review: `/api/review`.
- Suggested artifacts: `/api/suggested-tasks`, `/api/suggested-gather-items`, `/api/suggested-interests`.
- Calendar: `/api/appointments`, `/api/important-events`, `/api/events`, `/api/calendar`, `/api/horizon`, `/api/schedule`.
- Organization: `/api/sections`, `/api/section-pages`, `/api/clusters`, `/api/research`.
- Supporting: `/api/notes`, `/api/goals`, `/api/habits`, `/api/search`, `/api/export`, `/api/upload`, `/api/admin`, `/api/gather-items`, `/api/interests`.
- Compatibility surfaces remain in `server.js` and `routes/compat.js`, including legacy note and ripple aliases.

## Most Important Current Product Loop

The intended daily loop is:

1. Capture naturally in Stream or Today.
2. Let entry automation create pending review artifacts.
3. Review extracted artifacts in `/review`.
4. Accept, edit, keep, reject, dismiss, or approve items.
5. Act from Today, Task Inbox, Calendar, Gather Lists, Interests, Sections, or Clusters.
6. Recover mistakes through undo/Trash where implemented.

This loop is the highest-value area to keep improving. The app has many feature surfaces, but this loop is the strongest unifying product narrative.

## Recent Improvements Already Landed

- Review Inbox is now the main triage surface for automation.
- Review Inbox supports edit-before-accept for task, gather, and interest suggestions.
- Review Inbox supports selected bulk accept/keep and reject/dismiss actions.
- Review Inbox shows source text or source-entry excerpts.
- Review Inbox includes accepted/kept follow-up links to destination pages.
- Stream, Today, and the right sidebar surface pending review counts.
- Search results now have explicit action buttons for open, complete task, and review suggestion.
- Frontend routes are lazy-loaded.
- Browser-native `alert`, `confirm`, and `prompt` usage has been removed from active frontend code.
- A shared `ConfirmButton` exists for simple two-step destructive confirmations.
- Task soft-delete undo restores original records instead of recreating duplicate tasks.
- `react-hot-toast` is the consolidated notification path.
- Unreachable legacy `ManageSections` was removed.

## Current Strengths

- The backend has broad test coverage for the fragile parts: entry automation, task flows, calendar artifacts, review inbox, export security, trash behavior, and legacy contracts.
- The entry automation contract is clear: tasks/gather/interests are review-first; calendar artifacts can be created as active objects but must be linked and source-marked.
- The app now has a coherent review workflow instead of scattering pending automation across isolated pages.
- Auth and API access mostly go through shared helpers.
- Data is consistently scoped by authenticated user across most routes.
- Trash/restore patterns exist for important objects, especially tasks and entries.
- The app contains useful production-minded behavior: rate limiting, Helmet, upload content-type checks, JSON API 404 guard, and health check.

## Current Risks and Friction

### 1. Compatibility Surface Area Is Still Large

There are intentional shims and aliases in:

- `server.js`
- `routes/compat.js`
- `models/Entry.js`
- `models/Appointment.js`
- `utils/date.js`
- `utils/rippleExtractor.js`
- assorted frontend callers that still fallback to legacy endpoints.

This keeps older flows working, but it makes future route cleanup risky. Any cleanup should first prove there are no current frontend callers and preserve contract tests until migration is complete.

### 2. Product Has Many Surfaces But Not One Obvious Command Center

Today, Review Inbox, Stream, Calendar, Tasks, Gather, Interests, Sections, Clusters, Goals, Search, and Analytics all exist. The app is powerful but can feel like multiple apps. The strongest next product question is: which screen should a user live in most of the day?

Likely answer: Today plus Review Inbox, with Search as a recovery/recall layer.

### 3. Frontend Styling Is Still Mixed

There is a useful shared design base in:

- `frontend/src/variables.css`
- `frontend/src/base.css`
- `frontend/src/DesignSystem.css`

But many pages still use dense inline styles. This makes responsive polish, visual consistency, and future restyling harder. Good candidates for CSS extraction include Admin Panel, Habit Analytics, Gather Lists, Interests, smaller modal fields, and utility pages.

### 4. Search Is Broad But Action Coverage Is Partial

Search spans many models and now exposes some actions, but actions are uneven. It can open most things, complete tasks, and send suggestions to review. It does not yet consistently support edit, restore, delete, pin, schedule, or jump-to-source actions where those would be safe.

### 5. Review Inbox Has the Right Shape But Needs Workflow Depth

Review Inbox is now useful, but its next usability frontier is confidence and speed:

- batch editing before accept,
- keyboard shortcuts,
- better source navigation,
- confidence/reason display,
- "accept all like this" rules,
- source entry editing from the review context,
- clearer calendar keep/dismiss semantics.

### 6. Real Browser Smoke Coverage Is Missing

The backend/unit/contract suite is strong, but there is no clear Playwright/Cypress-style browser smoke that proves Stream capture -> Review Inbox -> accept -> destination page works through the actual UI.

### 7. API Wrappers Are Incomplete

`axiosInstance` is shared, but many components still call endpoints directly. Some domain wrappers exist under `frontend/src/api/`, but coverage is partial. This makes endpoint migrations harder and spreads response-shape assumptions across pages.

### 8. Automation Quality Is Product-Critical

The app depends heavily on extractors in `utils/entryAutomation.js`, `utils/rippleExtractor.js`, `utils/gatherExtractor.js`, `utils/interestExtractor.js`, and date utilities. False positives, duplicate artifacts, unclear source context, and date mistakes will directly affect trust.

## Engineering Inventory

Observed rough scale:

- Frontend source: about 1.1 MB.
- Backend routes: about 536 KB.
- Utilities: about 236 KB.
- Models: about 96 KB.
- Frontend files under `frontend/src`: about 136 JS/JSX/CSS files at shallow levels.
- Backend JS/MJS files under routes/models/utils/middleware/services: about 120.
- Tests: 49 test files with about 292 `describe`/`it`/`test` declarations.

This is large enough that future work should avoid broad rewrites. Prefer narrow vertical slices around the daily loop.

## High-Value Next Steps

### Product Usability

1. Build a "Daily Command Center" pass for `/day/:date`.
   - Show what needs attention first: overdue/today tasks, pending review count, next appointment, open schedule blocks.
   - Reduce duplicate panels and make the first screen answer "what should I do now?"

2. Make Review Inbox faster.
   - Add keyboard shortcuts for next item, accept, reject, select, bulk action.
   - Add source-entry jump links.
   - Add richer explanations: why was this suggested, which phrase triggered it, what date base was used.

3. Improve accepted-object follow-through.
   - After accepting a task, offer direct due-date editing, schedule placement, cluster selection, or "do today."
   - After accepting gather/interest, make it easy to assign list/category/cluster before it disappears.

4. Make Search a true recovery surface.
   - Add safe edit/delete/restore actions by type.
   - Add source links for suggestions and automation artifacts.
   - Add saved filters or recent searches.

5. Clarify navigation hierarchy.
   - Treat Today, Review, Search, and Calendar as primary.
   - Treat Gather, Interests, Goals, Sections, Clusters as management/organization.
   - Reduce cognitive load in the sidebar if testing shows too many options.

### Engineering Cleanup

1. Add a browser-level daily-loop smoke test.
   - Register/login disposable user.
   - Create entry with "I need to call the dentist tomorrow."
   - Verify Review Inbox item.
   - Edit/accept suggestion.
   - Verify task appears on the correct day.

2. Audit compatibility shims.
   - Map every compat endpoint to current frontend callers.
   - Remove only when no active caller remains and tests prove the replacement path.

3. Extract high-noise inline styles.
   - Start with Admin Panel and Habit Analytics because they are isolated.
   - Then Gather Lists and Interests because they are user-facing workflow pages.

4. Expand frontend API wrappers.
   - Move direct endpoint assumptions into `frontend/src/api/*`.
   - Keep page components focused on state and UX.

5. Add route/data contract docs.
   - Document canonical endpoint paths, deprecated aliases, and response shapes for entries/tasks/review/search.

6. Standardize confirmation flows.
   - Keep `ConfirmButton` for simple destructive actions.
   - Add one app-native confirmation modal for flows that need details, consequences, or typed confirmation.

## Brainstorming Prompts For Another LLM

Use these prompts to generate grounded ideas:

- How can `/day/:date` become the one screen a user can keep open all day?
- What information should Review Inbox expose so users trust extracted suggestions?
- What should happen immediately after accepting a task suggestion to reduce planning friction?
- Which feature surfaces should be folded into Today versus left as separate management pages?
- How can Search become an "I remember writing something about..." recovery workflow?
- What is the smallest browser smoke suite that would catch the worst regressions?
- Which compatibility shims can be retired safely, and what evidence is needed before deleting them?
- How should clusters work in the UI now that backend data uses ObjectId arrays?
- How can the app help users recover from bad automation without feeling punished?
- What metrics would show that the daily loop is actually usable?

## Suggested Implementation Order

1. Add Playwright or equivalent browser smoke for the daily loop.
2. Add source-entry links and keyboard shortcuts to Review Inbox.
3. Improve `/day/:date` prioritization and reduce first-screen clutter.
4. Extend Search actions for restore/edit/delete where APIs already exist.
5. Move direct endpoint calls into API wrappers for review/tasks/entries/search.
6. Extract inline styles from isolated utility pages.
7. Audit and prune compatibility aliases.

## Guardrails For Future Agents

- Do not make active tasks directly from entry automation; suggestions must be accepted first.
- Preserve accepted suggestions and user-created objects on entry update.
- Calendar automation may replace only artifacts linked to the entry and marked `source: "entry-automation"`.
- Calendar artifacts edited through user-facing routes should be marked `source: "user-edited"` and preserved.
- Use `utils/clusterIds.js` for backend cluster ID normalization.
- Use `frontend/src/utils/clusterHelpers.js` for frontend cluster display/slug behavior.
- Use shared `axiosInstance` for frontend requests.
- Use app-native confirmation/toast patterns, not browser dialogs.
- Before delivering code changes, run the real validation commands and report only commands actually run.

## Known Docs To Read Next

- `AGENTS.md`: repository conventions and automation contracts.
- `README.md`: setup, scripts, routes, and feature summary.
- `docs/usability-roadmap.md`: current usability backlog.
- `docs/manual-smoke-test.md`: manual functional checklist.
- `NAVIGATION_AUDIT.md`, `STYLING_AUDIT.md`: useful history, but dates are older and should be checked against current code.

