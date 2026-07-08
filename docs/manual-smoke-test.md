# Stream of Conshushness Manual Smoke Test

This checklist covers the current functional MVP path after the Phase 2 backend stabilization and early Phase 3 Daily Page UI work.

## Current MVP Status

| Area | Status | Notes |
| --- | --- | --- |
| Login/register | Usable now | `/login` and `/register` are wired as public routes. Password reset routes also exist. |
| Daily Page | Usable now | `/today` redirects to `/day/:date`; Daily Page shows tasks, entries, agenda, ripples, suggested tasks, other suggestion counts, notes, and hourly schedule. |
| Create journal entry | Usable now | `+ New Entry` opens `EntryModal`; save refreshes entries, agenda, ripples, suggested tasks, and other suggestion counts. |
| Entry automation/ripples | Usable now | Entry creation runs backend automation. Ripples are visible through `DailyRipples`; manual analyze uses `/api/ripples/analyze`. |
| Suggested task review on Daily Page | Usable now | Embedded Suggested Tasks panel supports accept/reject and refreshes the visible task/ripple/suggestion state. |
| Task list/create/toggle/carry-forward | Usable now | Daily task buckets use `/api/tasks/day/:date`; task creation/toggle/carry-forward routes and UI are wired. |
| Gather suggestions and gather list | Partially usable | `/gather-lists` includes the suggestion inbox and accepted items. Daily Page shows same-day pending counts and links, but does not embed accept/reject. |
| Interest suggestions and interest list | Partially usable | `/interests` includes the suggestion inbox and accepted items. Daily Page shows same-day pending counts and links, but does not embed accept/reject. |
| Calendar day/month display | Usable now | `/calendar` month view and `/day/:date` agenda use calendar APIs. |
| Appointment/event creation from automation | Usable now | Entry automation can create source-marked appointments/events linked to the entry. Update behavior is covered by backend tests. |
| Manual appointment/event creation | Usable now | Daily Page has `+ Add appointment`; Calendar has appointment and important-event modals. |
| Notes/schedule on Daily Page | Partially usable | `NotesSection` and `HourlySchedule` are mounted on Daily Page; this pass did not deeply test their workflows. |
| Search/export/settings/admin | Broken/unknown | Routes are wired, but they were not audited in this smoke pass. Admin likely requires appropriate privileges. |

## Local Smoke Setup

Use a disposable local database or a MongoDB Atlas test database. Do not point this smoke test at production data.

### Environment safety first

- Do not overwrite an existing `.env` without backing it up first. It may contain a working MongoDB Atlas URI or other local secrets.
- Never commit `.env`. It is intentionally ignored by git.
- If the app already works locally, keep the existing `MONGODB_URI` unless you intentionally want to switch databases for the smoke test.
- A MongoDB Atlas test database URI is the easiest recommended option when local MongoDB is not already installed and running.
- A local URI such as `mongodb://127.0.0.1:27017/streamofconshushness-smoke` only works if MongoDB is installed and the MongoDB service is running.
- `npm run dev` starts Express and Vite. It does not start MongoDB.

Before editing `.env`, check whether one already exists:

```bash
test -f .env && echo ".env exists; back it up before editing" || cp -n .env.example .env
```

If `.env` exists and you intentionally want a backup:

```bash
cp .env ".env.backup.$(date +%Y%m%d-%H%M%S)"
```

1. Install dependencies at the repo root and frontend:
   ```bash
   npm install
   cd frontend && npm install && cd ..
   ```
2. Create `.env` from the example only if it does not already exist:
   ```bash
   cp -n .env.example .env
   ```
3. Set the required values in `.env`, preserving any already-working `MONGODB_URI`:
   ```bash
   MONGODB_URI=mongodb://127.0.0.1:27017/streamofconshushness-smoke
   JWT_SECRET=replace_with_at_least_32_random_characters
   PORT=3000
   CLIENT_ORIGIN=http://localhost:5173
   NODE_ENV=development
   ```
   A MongoDB Atlas test database URI is recommended if you do not already have local MongoDB installed and running.
4. Start the app:
   ```bash
   npm run dev
   ```
5. Confirm the backend starts and logs that it is listening on `http://localhost:3000` and connected to MongoDB.
6. Open the frontend URL printed by Vite, usually `http://localhost:5173`.
7. Create a disposable user from `/register`, for example `smoke-YYYYMMDD`.

To clear smoke data afterward, use the safest option available:

- If you used a dedicated smoke database, drop that database with MongoDB Compass, Atlas UI, or `mongosh`.
- If you used a shared development database, delete only the disposable smoke user and that user's documents manually. There is no dedicated app reset script for smoke data.

Example `mongosh` cleanup for the dedicated local database above:

```bash
mongosh "mongodb://127.0.0.1:27017/streamofconshushness-smoke" --eval "db.dropDatabase()"
```

Only run destructive cleanup commands against a dedicated disposable smoke database.

## Mongo Troubleshooting

- `MongooseError: Operation users.findOne() buffering timed out after 10000ms` usually means the backend could not reach MongoDB. Check `MONGODB_URI`, confirm whether it points to Atlas or localhost, and verify MongoDB availability.
- `MongoParseError: Invalid scheme, expected connection string to start with "mongodb://" or "mongodb+srv://"` means `MONGODB_URI` is missing, still a placeholder, or malformed.
- If using Atlas, confirm the URI starts with `mongodb+srv://` or `mongodb://`, the password is URL-encoded when needed, and the IP/network access rules allow your machine.
- If using local MongoDB, confirm `mongod` is installed and running before starting the app.
- Seeing `dotenv` report `injecting env (0) from .env` can be normal when variables were already present in the shell, but it is suspicious if the app is not seeing expected values.

## Smoke Test Setup

After local setup is complete, use a fresh test account or a disposable local database when possible.

## Automated Browser Smoke

The repo includes a minimal Playwright smoke test for the core daily loop:

```bash
npx playwright install chromium
RUN_BROWSER_SMOKE=1 BROWSER_SMOKE_START_SERVER=1 npm run test:browser-smoke
```

This starts isolated smoke servers, registers disposable users, creates the Stream entry `I need to call the dentist tomorrow.`, verifies the pending Review Inbox task suggestion, accepts it, and confirms `Call the dentist` appears on tomorrow's `/day/:date` page. It also creates `I'm going to visit my mom on the 13th.` and verifies the extracted `Visit my mom` event appears on the expected day agenda.

Requirements:

- A working `.env` with `MONGODB_URI` pointing at a disposable test database.
- `JWT_SECRET` set to a valid value.
- Chromium installed through `npx playwright install chromium`.
- Ports `3100` and `5174` available when `BROWSER_SMOKE_START_SERVER=1`, unless you set `E2E_API_BASE` and `E2E_BASE_URL`.

Without `RUN_BROWSER_SMOKE=1`, `npm run test:browser-smoke` intentionally skips so normal unit/build validation does not depend on a live database or browser binary.

## Manual Smoke Checklist

### 1. Auth

1. Open `/register`.
2. Register a new test user.
3. Confirm the app enters the authenticated layout.
4. Log out if available, then log back in from `/login`.

Expected result: authentication succeeds and protected routes such as `/today` are accessible.

### 2. Daily Page Loads

1. Open `/today`.
2. Confirm the URL redirects to `/day/YYYY-MM-DD`.
3. Confirm these sections render without errors:
   - Due Today
   - On Your Radar
   - Suggested Tasks
   - Other Suggestions
   - Ripples for the day
   - Today’s Entries
   - Appointments & Events
   - Hourly Schedule
   - Notes

Expected result: the page loads with empty states or existing data, not console/runtime crashes.

### 3. Suggested Task Flow

1. On `/today`, click `+ New Entry`.
2. Create this entry:
   ```text
   I need to call the dentist tomorrow.
   ```
3. Save the entry.
4. In `Suggested Tasks`, verify a task suggestion appears for `Call the dentist`.
5. Verify the suggestion due date is tomorrow relative to the entry date.
6. Click `Accept`.
7. Confirm the suggestion disappears.
8. Navigate to tomorrow’s `/day/YYYY-MM-DD` if needed.
9. Confirm the accepted task appears in the task list with the expected due date.
10. Confirm the source ripple is no longer shown as pending on the original day.

Expected result: exactly one active task is created, linked to the source entry where available, and the pending suggestion is removed.

### 4. Suggested Task Rejection

1. Create another entry:
   ```text
   I need to email the school tomorrow.
   ```
2. Save the entry.
3. Verify `Email the school` appears under `Suggested Tasks`.
4. Click `Reject`.

Expected result: the suggestion disappears and no active task is created.

### 5. Gather Suggestion Awareness

1. Create this entry:
   ```text
   I need to buy printer paper.
   ```
2. Save the entry.
3. In `Other Suggestions`, verify the Gather items count increases for the current day.
4. Click the Gather items card or the `Gather suggestions` link.
5. On `/gather-lists`, accept the pending printer paper suggestion.

Expected result: accepted item appears in the Gather list, and returning to the Daily Page eventually shows the count reduced after refresh.

### 6. Interest Suggestion Awareness

1. Create this entry:
   ```text
   I want to learn pottery.
   ```
2. Save the entry.
3. In `Other Suggestions`, verify the Interests count increases for the current day.
4. Click the Interests card or the `Interest suggestions` link.
5. On `/interests`, accept the pending pottery suggestion.

Expected result: accepted interest appears in the Interests page, and returning to the Daily Page eventually shows the count reduced after refresh.

### 7. Ripple Visibility

1. Create or use a task-like entry that generated a ripple.
2. Confirm `Ripples for YYYY-MM-DD` shows pending ripple content or an empty state.
3. Use `analyze entry` on an entry if needed.

Expected result: analyze calls `/api/ripples/analyze`; no request should be made to `/api/entries/:id/analyze`.

### 8. Calendar Automation

1. Create this entry:
   ```text
   I have a doctor's appointment at 3pm on June 25th.
   ```
2. Save the entry.
3. Open `/calendar` and navigate to June 2026 if needed.
4. Open `/day/2026-06-25`.

Expected result: the appointment appears on the calendar/day agenda and is linked to the entry through backend automation.

### 9. Calendar Automation Replacement

1. Edit the original appointment-like entry.
2. Change it to:
   ```text
   I have a dentist appointment at 4pm on June 26th.
   ```
3. Save.
4. Open `/day/2026-06-25` and `/day/2026-06-26`.

Expected result: the old automation-created appointment does not duplicate or remain as an automation artifact; the new appointment appears on June 26.

### 10. Manual Appointment Protection

1. On a Daily Page, click `+ Add appointment`.
2. Create a manual appointment.
3. Edit the appointment from the agenda or calendar.
4. Edit an unrelated journal entry on the same day.

Expected result: the manually edited appointment remains and is not removed by entry automation cleanup.

### 11. Entry Update Suggestion Replacement

1. Create this entry:
   ```text
   I need to call the dentist tomorrow.
   ```
2. Do not accept the suggestion yet.
3. Edit the entry text to:
   ```text
   I need to email the school tomorrow.
   ```
4. Save.

Expected result: the pending dentist suggestion is gone or no longer pending, and only one pending school suggestion exists.

### 12. Accepted Object Preservation

1. Create and accept a suggested task from an entry.
2. Edit the original entry to a different task-like sentence.

Expected result: the accepted task still exists, the old accepted suggestion is not reverted to pending, and a new pending suggestion appears for the updated text.

## Known Risks To Watch During Smoke Testing

- Daily Page gather/interest counts use backend `date=YYYY-MM-DD` filters on suggested item list routes.
- Gather/interest suggestions are linked from Daily Page but not accepted inline there.
- Duplicate ripple UI components remain: `frontend/src/DailyRipples.jsx`, `frontend/src/components/DailyRipples.jsx`, and `frontend/src/adapters/DailyRipples.default.jsx`.
- Search, export, settings, admin, notes, and hourly schedule need deeper workflow-specific smoke passes.
