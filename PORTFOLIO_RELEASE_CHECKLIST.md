# Stream of Conshushness — UX Portfolio Release Checklist

## Release goal

Prepare one stable, understandable, testable version of Stream of Conshushness that can be used as a UX design portfolio case study.

The portfolio version does **not** need every planned feature. It needs one coherent product argument and one reliable end-to-end user journey:

> **Capture a thought immediately → let structure appear afterward → review what the system inferred → retrieve or act on it later.**

This checklist is the release boundary. New features that do not directly improve that journey belong in **Nice Later** unless user testing proves otherwise.

---

# BLOCKER — must be true before portfolio release

## B1. Reconcile local work with GitHub `main`

GitHub `main` currently ends at the July 1, 2026 commit `56db60a` (`Move Remember This near top of Today`). Later local work discussed during development must be reconciled before the repository can represent the portfolio build.

- [ ] Run `git status --short` locally.
- [ ] Review all uncommitted and unpushed work.
- [ ] Confirm later automation-preservation changes are present locally.
- [ ] Remove accidental/debug-only changes before release.
- [ ] Run full validation locally.
- [ ] Commit the intended current state.
- [ ] Push the portfolio candidate to GitHub.
- [ ] Confirm the deployed app, local app, and GitHub commit represent the same product state.

**Release evidence:** record the final portfolio commit SHA here: `________________________`

---

## B2. Core journey works end-to-end

A new user must be able to complete the following without hidden knowledge of the product architecture.

### Capture
- [ ] User can sign up or log in.
- [ ] Stream opens with the capture input easy to locate.
- [ ] User can enter a natural-language thought without categorizing it first.
- [ ] Saving gives clear feedback.
- [ ] The saved entry remains visible after refresh.

### Structure / review
- [ ] A thought that should produce a task/suggestion creates the expected reviewable artifact.
- [ ] The user can tell that the system found something worth reviewing.
- [ ] The route from captured entry to review area is understandable.
- [ ] Accepting/converting a suggestion does not create duplicates.
- [ ] Editing irrelevant metadata does not unexpectedly destroy/regenerate accepted or pending artifacts.

### Retrieval
- [ ] User can find the original entry again.
- [ ] User can find the resulting task/item again.
- [ ] Search/filter behavior gives an understandable empty state when nothing matches.

### Recovery
- [ ] Destructive entry deletion requires confirmation.
- [ ] Deleted entries go to Trash rather than disappearing permanently.
- [ ] A trashed entry can be restored.
- [ ] Restored content does not appear duplicated.

---

## B3. Primary information architecture is clear

The product thesis depends on reducing navigation and working-memory friction. The visible hierarchy must support that thesis.

- [ ] `Stream` is clearly the default capture surface.
- [ ] `Today` is clearly the place for current actionable context.
- [ ] `Calendar` is clearly the place for time-bound information.
- [ ] Secondary concepts (Tasks, Ripples, Gather, Interests, Sections, Clusters, Goals, Search, Export, Trash, Settings, analytics) do not visually compete with the primary journey.
- [ ] Review items are grouped consistently under a clear concept such as Review.
- [ ] Organizing tools are grouped consistently under a clear concept such as Organize.
- [ ] Utility/account tools are visually secondary.
- [ ] A first-time user is not required to understand `Ripples`, `Clusters`, `Sections`, or other internal vocabulary before capturing a thought.
- [ ] Mobile navigation exposes the primary journey without requiring horizontal hunting or excessive scrolling.

**Decision rule:** if simplifying navigation conflicts with preserving every direct link, simplify the visible navigation. Routes may remain available without being first-class navigation.

---

## B4. First-use experience produces one clear “aha”

Current Stream onboarding already communicates the correct concept: write naturally first, structure afterward. Portfolio release should sharpen that instead of adding a feature tour.

- [ ] First-use Stream explains the product in one short idea.
- [ ] At least one concrete natural-language example is visible.
- [ ] Capture input remains visually dominant over onboarding copy.
- [ ] Helper/onboarding content is dismissible.
- [ ] Dismissal persists.
- [ ] Onboarding does not require the user to learn all feature names.
- [ ] New-user empty states tell the user what useful action to take next.

---

## B5. Manual responsive QA completed

Do not infer responsiveness from CSS. Test the running application.

### Mobile (~360–390 px)
- [ ] Login/register usable.
- [ ] Stream capture input immediately findable.
- [ ] Stream entry cards readable.
- [ ] Review controls/touch targets usable.
- [ ] Today page usable without layout collisions.
- [ ] Calendar usable without horizontal-layout failure.
- [ ] Navigation usable with one hand / touch.
- [ ] Modals fit viewport and can be dismissed.

### Tablet (~768 px)
- [ ] Primary layouts do not create awkward dead zones.
- [ ] Navigation remains understandable.
- [ ] Forms and cards have sensible widths.

### Desktop (>= 1280 px)
- [ ] Primary content does not become excessively wide.
- [ ] Sidebar does not overpower the main journey.
- [ ] Stream/Today/Calendar hierarchy remains obvious.

**Release evidence:** save screenshots for all three sizes for the case study.

---

## B6. Basic accessibility / interaction-state QA completed

This is a practical portfolio gate, not a claim of formal WCAG certification.

- [ ] Primary workflow can be completed with keyboard only.
- [ ] Visible focus states exist for primary controls.
- [ ] Inputs have labels or accessible names.
- [ ] Icon-only buttons have useful accessible names/titles.
- [ ] Error messages are understandable and visible.
- [ ] Loading states are visible.
- [ ] Empty states are visible and actionable when appropriate.
- [ ] Disabled controls look disabled.
- [ ] Confirmation/destructive states are explicit.
- [ ] Light mode text is readable.
- [ ] Dark mode text is readable.
- [ ] No obvious low-contrast critical controls.
- [ ] Motion/animation does not block use.

---

## B7. Production/demo build is dependable

- [ ] `npm test` passes.
- [ ] `npm run build` passes.
- [ ] `cd frontend && npm run lint` passes with no errors.
- [ ] Known warnings are reviewed and recorded if intentionally deferred.
- [ ] Fresh registration works in production/demo environment.
- [ ] Login works after browser refresh.
- [ ] Production database is reachable.
- [ ] `/health` reports ready when the application is actually usable.
- [ ] No development-only route/secret is accidentally exposed in production.
- [ ] Password reset behavior is either functional or clearly excluded from the public demo path.
- [ ] Demo can be opened by a portfolio reviewer without local setup.

---

# TEST WITH USERS — evidence required for the case study

The purpose is not to prove the design is perfect. The purpose is to observe where the mental model fails, make targeted changes, and document the iteration.

## Participant target

- [ ] Test with at least 3 people.
- [ ] Prefer 5 if available without delaying release indefinitely.
- [ ] At least one participant should not already know the app vocabulary.
- [ ] Avoid teaching the interface before the task unless they are completely stuck.

## Core moderated tasks

Give the participant the goal, not the clicks.

### Task 1 — Capture without categorizing
> “You just remembered you need milk tomorrow. Put that somewhere so you won’t lose it.”

Observe:
- [ ] Where they click first.
- [ ] Whether they hesitate because they think they must categorize it.
- [ ] Whether the capture field is obvious.
- [ ] Whether save feedback is sufficient.

### Task 2 — Find what the system did with it
> “See whether the app recognized anything actionable from what you wrote.”

Observe:
- [ ] Whether they notice the review path.
- [ ] What they expect `Tasks`, `Ripples`, `Gather`, etc. to mean.
- [ ] Whether terminology causes hesitation.

### Task 3 — Make it actionable
> “Turn the useful thing the app found into something you can act on.”

Observe:
- [ ] Whether acceptance/conversion controls make sense.
- [ ] Whether system feedback explains what happened.
- [ ] Whether they know where the resulting item went.

### Task 4 — Recover the original thought
> “It’s later now. Find the thing you originally wrote.”

Observe:
- [ ] Whether they use Stream, Search, Today, or another route.
- [ ] Whether the information architecture matches their expectation.
- [ ] How many wrong turns occur.

### Task 5 — Correct a mistake
> “Pretend you entered that by mistake. Remove it, then recover it if you change your mind.”

Observe:
- [ ] Whether deletion language feels destructive/reversible.
- [ ] Whether Trash is discoverable when needed.
- [ ] Whether restoration is understandable.

---

## Capture evidence for each test

- [ ] Participant ID / pseudonym.
- [ ] Date.
- [ ] Device / screen size.
- [ ] Task success or failure.
- [ ] Wrong turns / navigation loops.
- [ ] Quotes worth preserving.
- [ ] Terminology confusion.
- [ ] Places where the participant asked what to do next.
- [ ] Places where they succeeded without instruction.
- [ ] Changes made because of the session.
- [ ] Changes deliberately **not** made and why.

---

# CASE STUDY — material required before publishing

## C1. Problem framing

- [ ] Write a concise problem statement centered on capture friction and working-memory loss.
- [ ] Explain why traditional planner/navigation patterns were insufficient for the target experience.
- [ ] Clearly separate the design problem from the implementation technology.
- [ ] Define the primary design principle: capture first, structure afterward.

Suggested framing:

> Traditional productivity tools often require users to decide where information belongs before they can record it. For thoughts that decay quickly under navigation and categorization friction, the organizational system can become the reason the information is lost. Stream of Conshushness explores a capture-first model: record the thought immediately, then allow structure to emerge afterward.

---

## C2. Show the key iterations

Document concrete problem → decision → result chains. At minimum:

- [ ] Entry/capture box became too buried → moved capture priority upward.
- [ ] Too many nested navigation links consumed space/attention → consolidated visible navigation/grouping.
- [ ] Upfront classification created friction → natural-language capture became primary.
- [ ] Automation needed user trust → reviewable suggestions rather than silent destructive changes.
- [ ] Delete risk → confirmation + Trash + restore.
- [ ] `Remember This` was too low on Today/mobile → moved near top of page.
- [ ] Metadata edits were unnecessarily regenerating automation artifacts → automation dependencies narrowed to relevant persisted inputs.
- [ ] Include at least one change discovered through external user testing.

For each iteration capture:
- [ ] Before screenshot or sketch when available.
- [ ] What was wrong.
- [ ] Constraint/trade-off.
- [ ] What changed.
- [ ] What happened afterward.

---

## C3. Portfolio screenshots / visuals

- [ ] Stream desktop screenshot.
- [ ] Stream mobile screenshot.
- [ ] Today screenshot.
- [ ] Calendar screenshot.
- [ ] Review/suggestion screenshot.
- [ ] Search/retrieval screenshot.
- [ ] Trash/recovery screenshot if useful to the story.
- [ ] Before/after example for at least one major UX iteration.
- [ ] Avoid screenshots full of personal/private production data; use deliberate demo content.

---

## C4. Public README becomes a UX project front door

Replace feature-list-first framing with a case-study-oriented introduction.

- [ ] One-sentence product/problem statement at top.
- [ ] Hero screenshot or short demo visual.
- [ ] “Why this exists” section.
- [ ] Core user journey.
- [ ] Key design decisions / iterations.
- [ ] Testing summary.
- [ ] Accessibility/responsive notes.
- [ ] Technical stack lower on page rather than leading the story.
- [ ] Live demo link.
- [ ] Portfolio/case-study link when published.
- [ ] Keep setup/development instructions for technical reviewers.

---

## C5. Define what success means without fake metrics

Do not invent productivity gains or accessibility claims.

Use evidence such as:
- [ ] Task completion in usability sessions.
- [ ] Reduced wrong turns between iterations.
- [ ] Reduced need for instruction.
- [ ] Participant interpretation of navigation labels.
- [ ] Capture-field discovery time / hesitation, if actually observed.
- [ ] Qualitative quotes.
- [ ] Engineering reliability evidence (tests/build/demo stability) as supporting evidence, not UX outcome evidence.

---

# NICE LATER — explicitly not required for portfolio release

These may be valuable product work. They are not allowed to hold the portfolio hostage unless user testing exposes them as necessary to the core journey.

- [ ] Issue #41 — review-first natural-language work schedule reconciliation.
- [ ] Partial per-shift schedule selection.
- [ ] Expanded habit analytics.
- [ ] Additional games/fun features.
- [ ] New section layouts.
- [ ] New cluster mechanics.
- [ ] New goal systems.
- [ ] More automation categories.
- [ ] Major visual redesign.
- [ ] Perfect elimination of every lint warning if warnings are understood and harmless.
- [ ] Refactoring code that is stable but aesthetically displeasing.
- [ ] Features whose primary justification is “while we’re here.”

---

# Release sequence

Work in this order so UX evidence can change the product before cosmetic polishing locks it in.

1. [ ] Reconcile/push current code.
2. [ ] Validate build/test/lint and production demo.
3. [ ] Manually test the core capture → review → retrieval → recovery loop.
4. [ ] Simplify primary navigation where needed.
5. [ ] Tighten first-use/empty-state guidance.
6. [ ] Complete mobile/tablet/desktop QA.
7. [ ] Complete keyboard/basic accessibility QA.
8. [ ] Run first 3 usability sessions.
9. [ ] Fix repeated/high-impact usability failures.
10. [ ] Re-test changed flow.
11. [ ] Freeze a portfolio release commit/tag.
12. [ ] Capture polished demo screenshots/data.
13. [ ] Rewrite README around the UX case study.
14. [ ] Write/publish portfolio case study.
15. [ ] Resume Nice Later development only after the portfolio version is frozen.

---

# Portfolio release definition of done

Stream of Conshushness is ready for the UX portfolio when all of the following are true:

- [ ] GitHub, deployment, and intended portfolio build match.
- [ ] A new user can complete capture → review → retrieval → recovery without developer guidance.
- [ ] Primary navigation supports rather than contradicts the capture-first thesis.
- [ ] Mobile, tablet, and desktop have been manually checked.
- [ ] Basic keyboard/accessibility states have been manually checked.
- [ ] Build/tests/lint meet the agreed release gate.
- [ ] At least 3 external usability sessions have been documented.
- [ ] At least one meaningful design iteration can be directly traced to user testing.
- [ ] Case-study screenshots use safe demo data.
- [ ] README communicates the design problem before the feature inventory.
- [ ] A fixed portfolio release commit/tag exists.

When those boxes are checked, **ship the case study**. Do not move the finish line because another feature sounds useful.
