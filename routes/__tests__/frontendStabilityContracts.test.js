import { readFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), 'utf8');

describe('frontend stability endpoint contracts', () => {
  it('keeps current app routes registered', () => {
    const app = read('frontend/src/App.jsx');
    const expectedRoutes = [
      'path="/" element={<MainPage />}',
      'path="/calendar" element={<Calendar />}',
      'path="/goals" element={<GoalPage />}',
      'path="/today" element={<TodayRedirect />}',
      'path="/sections" element={<SectionsIndex />}',
      'path="/sections/:key" element={<SectionPage />}',
      'path="/clusters" element={<ClustersIndex />}',
      'path="/gather-lists" element={<GatherListsPage />}',
      'path="/interests" element={<InterestsPage />}',
      'path="/review" element={<ReviewInbox />}',
      'path="/ripples" element={<RippleReviewUI />}',
      'path="/inbox/tasks" element={<InboxTasksPage />}',
      'path="/search" element={<GlobalSearch />}',
      'path="/export" element={<ExportData />}',
      'path="/trash" element={<TrashPage />}',
      'path="/account" element={<Account />}',
      'path="/settings" element={<UserSettings />}',
    ];

    for (const route of expectedRoutes) {
      expect(app).toContain(route);
    }
  });

  it('keeps the review inbox on app-native review controls', () => {
    const reviewInbox = read('frontend/src/pages/ReviewInbox.jsx');

    expect(reviewInbox).toContain('selectedKeys');
    expect(reviewInbox).toContain('applyBulkAction');
    expect(reviewInbox).toContain('sourceEntryExcerpt');
    expect(reviewInbox).toContain('sourceEntryPath');
    expect(reviewInbox).toContain('Open source entry');
    expect(reviewInbox).toContain('review-shortcuts');
    expect(reviewInbox).toContain('isTypingTarget');
    expect(reviewInbox).toContain("key === 'j'");
    expect(reviewInbox).toContain('completedItems');
    expect(reviewInbox).toContain('acceptedTarget');
    expect(reviewInbox).toContain('Confirm dismiss');
    expect(reviewInbox).not.toContain('window.confirm');
    expect(reviewInbox).not.toContain('alert(');
    expect(reviewInbox).not.toContain('prompt(');
  });

  it('keeps trash destructive actions on inline confirmations', () => {
    const trash = read('frontend/src/pages/TrashPage.jsx');

    expect(trash).toContain('confirmingTaskDeleteId');
    expect(trash).toContain('confirmingEmptyTrash');
    expect(trash).toContain('Confirm Empty Trash');
    expect(trash).toContain('Confirm Delete');
    expect(trash).not.toContain('window.confirm');
  });

  it('keeps active routed pages off browser-native dialogs', () => {
    const activeSources = [
      'frontend/src/MainPage.jsx',
      'frontend/src/Calendar.jsx',
      'frontend/src/DailyPage.jsx',
      'frontend/src/GoalPage.jsx',
      'frontend/src/pages/Account.jsx',
      'frontend/src/pages/ClusterRoom.jsx',
      'frontend/src/pages/ResearchSectionPage.jsx',
      'frontend/src/pages/ReviewInbox.jsx',
      'frontend/src/pages/SectionPage.jsx',
      'frontend/src/pages/SectionsIndex.jsx',
      'frontend/src/pages/TrashPage.jsx',
      'frontend/src/TopPriorities.jsx',
    ];

    for (const sourcePath of activeSources) {
      const source = read(sourcePath);
      expect(source, sourcePath).not.toMatch(/window\.(alert|confirm|prompt)\b/);
      expect(source, sourcePath).not.toMatch(/\b(alert|prompt)\s*\(/);
    }
  });

  it('shows pending review counts in daily entry surfaces', () => {
    const main = read('frontend/src/MainPage.jsx');
    const daily = read('frontend/src/DailyPage.jsx');
    const hook = read('frontend/src/hooks/useReviewCount.js');
    const reviewSummary = read('frontend/src/components/ReviewInboxSummary.jsx');

    expect(hook).toContain('listReviewItems({ limit: 1 })');
    expect(main).toContain('useReviewCount');
    expect(main).toContain('ReviewInboxSummary');
    expect(main).toContain('reviewCount.counts');
    expect(reviewSummary).toContain('useful ${total === 1 ? \'thread\' : \'threads\'}');
    expect(daily).toContain('useReviewCount');
    expect(daily).toContain('reviewCount.count > 0');
    expect(daily).toContain('Ready to review');
  });

  it('keeps search results action-oriented', () => {
    const search = read('frontend/src/pages/GlobalSearch.jsx');

    expect(search).toContain('handleResultAction');
    expect(search).toContain("action === 'completeTask'");
    expect(search).toContain("navigate('/review')");
    expect(search).toContain('onAction(item, action.key)');
  });

  it('keeps header, layout, and command palette navigation aligned with current routes', () => {
    const app = read('frontend/src/App.jsx');
    const header = read('frontend/src/Header.jsx');
    const mobileShell = read('frontend/src/components/MobileShell.jsx');
    const commandPalette = read('frontend/src/components/CommandPalette.jsx');
    const navigationSources = `${header}\n${mobileShell}`;

    for (const target of ['/', '/today', '/calendar']) {
      expect(header).toContain(`to="${target}"`);
    }

    for (const target of ['/sections', '/clusters', '/goals', '/review', '/ripples', '/interests', '/gather-lists', '/inbox/tasks', '/search', '/trash', '/export', '/account', '/settings']) {
      expect(navigationSources).toContain(`to="${target}"`);
    }

    for (const target of ['/', '/today', '/calendar', '/goals', '/review', '/sections', '/clusters', '/ripples', '/interests', '/gather-lists', '/search', '/export', '/trash', '/account', '/settings']) {
      expect(commandPalette).toContain(`target: '${target}'`);
      if (target === '/today') {
        expect(app).toContain('path="/today" element={<TodayRedirect />}');
      } else {
        expect(app).toContain(`path="${target}"`);
      }
    }

    expect(commandPalette).not.toContain("target: '/habits/analytics'");
    expect(app).toContain('path="/habits/analytics" element={<Navigate to="/today" replace />}');
  });

  it('uses one focused content column instead of a duplicate command sidebar', () => {
    const layout = read('frontend/src/Layout.jsx');

    expect(layout).toContain('app-body--focused');
    expect(layout).not.toContain('section-sidebar--right');
    expect(layout).not.toContain('Secondary navigation');
  });

  it('deduplicates daily important event aliases before rendering the agenda', () => {
    const daily = read('frontend/src/DailyPage.jsx');

    expect(daily).toContain('function eventAliasKey(item)');
    expect(daily).toContain('const importantKeys = new Set((important || []).map(eventAliasKey));');
    expect(daily).toContain('.filter(e => !importantKeys.has(eventAliasKey(e)))');
  });

  it('documents currently unreachable legacy frontend surfaces before cleanup', () => {
    const app = read('frontend/src/App.jsx');
    const sectionLanding = read('frontend/src/pages/SectionLanding.jsx');
    const sidebar = read('frontend/src/Sidebar.jsx');
    const entriesSection = read('frontend/src/EntriesSection.jsx');

    // Documentation guard: these files exist, but are not currently routed directly from App.jsx.
    expect(sectionLanding).toContain('export default function SectionLanding');
    expect(sidebar).toContain('export default function Sidebar');
    expect(entriesSection).toContain('export default');
    expect(existsSync(join(root, 'frontend/src/ManageSections.jsx'))).toBe(false);
    expect(app).not.toContain('SectionLanding');
    expect(app).not.toContain("from './Sidebar");
    expect(app).not.toContain('EntriesSection');
    expect(app).not.toContain('ManageSections');
  });

  it('uses the canonical task toggle route instead of the removed complete route', () => {
    const source = read('frontend/src/TaskList.jsx');

    expect(source).toContain('/api/tasks/${task._id}/toggle');
    expect(source).not.toContain('/api/tasks/${task._id}/complete');
  });

  it('uses the canonical section pages by-section route in legacy section callers', () => {
    const sidebar = read('frontend/src/SectionSidebar.jsx');
    const landing = read('frontend/src/pages/SectionLanding.jsx');

    expect(sidebar).toContain('/api/section-pages/by-section/');
    expect(landing).toContain('/api/section-pages/by-section/');
    expect(sidebar).not.toContain('/api/section-pages?section=');
    expect(landing).not.toContain('/api/section-pages?section=');
  });

  it('looks up entries for important events by date route', () => {
    const source = read('frontend/src/ImportantEventModal.jsx');

    expect(source).toContain('/api/entries/by-date/${eventDate}');
    expect(source).not.toContain('/api/entries/${eventDate}');
  });

  it('uses only real ripple dismiss endpoints', () => {
    const review = read('frontend/src/RippleReviewUI.jsx');
    const daily = read('frontend/src/DailyRipples.jsx');

    expect(review).toContain('/api/ripples/${id}/dismiss');
    expect(daily).toContain('/api/ripples/${id}/dismiss');
    expect(review).not.toContain('/api/ripples/${id}/status');
    expect(daily).not.toContain('/api/ripples/${id}/status');
    expect(review).not.toContain('axios.patch(`/api/ripples/${id}`');
    expect(daily).not.toContain('axios.patch(`/api/ripples/${id}`');
  });

  it('resolves virtual recurring appointment ids before edit/delete calls', () => {
    const helper = read('frontend/src/utils/appointmentIds.js');
    const calendar = read('frontend/src/Calendar.jsx');
    const daily = read('frontend/src/DailyPage.jsx');

    expect(helper).toContain("id.startsWith('virtual:')");
    expect(helper).toContain("id.split(':')[1]");
    expect(helper).toContain('isVirtualRecurringAppointment');
    expect(helper).toContain('isRecurringAppointment');
    expect(calendar).toContain('getStoredAppointmentId');
    expect(daily).toContain('getStoredAppointmentId');
  });

  it('uses recurring-series wording for appointment edit and delete flows', () => {
    const helper = read('frontend/src/utils/appointmentIds.js');
    const modal = read('frontend/src/AppointmentModal.jsx');
    const calendar = read('frontend/src/Calendar.jsx');
    const daily = read('frontend/src/DailyPage.jsx');

    expect(helper).toContain('This is part of a recurring appointment series. Delete the entire series?');
    expect(helper).toContain('Delete this recurring appointment series?');
    expect(helper).toContain('Delete this appointment?');
    expect(modal).toContain('This is part of a recurring appointment series. Changes will apply to the whole series.');
    expect(calendar).toContain('getAppointmentDeleteConfirmation');
    expect(calendar).toContain('confirmingAppointmentDeleteId');
    expect(calendar).not.toContain('window.confirm');
    expect(daily).toContain('getAppointmentDeleteConfirmation');
    expect(daily).toContain('confirmingAppointmentDeleteId');
    expect(daily).not.toContain('window.confirm');
  });

  it('keeps appointment display details and controls visible in calendar and day views', () => {
    const helper = read('frontend/src/utils/appointmentIds.js');
    const calendar = read('frontend/src/Calendar.jsx');
    const horizon = read('frontend/src/components/OnTheHorizon.jsx');
    const daily = read('frontend/src/DailyPage.jsx');

    expect(helper).toContain('getAppointmentDetailParts');
    expect(helper).toContain("parts.push('Recurring')");
    expect(calendar).toContain('OnTheHorizon');
    expect(calendar).toContain('onEditAppointment={openEditAppointment}');
    expect(calendar).toContain('onDeleteAppointment={deleteAppointment}');
    expect(horizon).toContain('getAppointmentDetailParts(item)');
    expect(horizon).toContain('item.details');
    expect(horizon).toContain('onEditAppointment(item)');
    expect(horizon).toContain('onDeleteAppointment(item)');
    expect(daily).toContain('getAppointmentDetailParts(item, formatHM)');
    expect(daily).toContain('item.details');
    expect(daily).toContain('openEditAppointment(item)');
    expect(daily).toContain('deleteAppointment(item)');
  });

  it('routes and links to the existing goals page using real goal endpoints', () => {
    const app = read('frontend/src/App.jsx');
    const header = read('frontend/src/Header.jsx');
    const goals = read('frontend/src/GoalPage.jsx');
    const routes = read('routes/goals.js');

    expect(app).toContain("const GoalPage = lazy(() => import('./GoalPage.jsx'))");
    expect(app).toContain('path="/goals" element={<GoalPage />}');
    expect(header).toContain('to="/goals"');
    expect(header).toContain('Goals');
    expect(goals).toContain("axios.get('/api/goals')");
    expect(goals).toContain("axios.post('/api/goals'");
    expect(goals).toContain('axios.patch(`/api/goals/${goalId}/step/${stepIndex}`');
    expect(routes).toContain("router.get('/', auth");
    expect(routes).toContain("router.post('/', auth");
    expect(routes).toContain("router.patch('/:id/step/:index', auth");
    expect(goals).not.toContain("axios.get('/api/goal')");
    expect(goals).not.toContain("axios.post('/api/goal'");
    expect(goals).not.toContain('axios.patch(`/api/goal/');
  });

  it('keeps the goals page guarded with basic UX states and validation', () => {
    const goals = read('frontend/src/GoalPage.jsx');

    expect(goals).toContain('Loading goals...');
    expect(goals).toContain('No goals yet. Add one to start shaping the thread.');
    expect(goals).toContain('Could not load goals. Try refreshing the page.');
    expect(goals).toContain('Could not create goal. Try again.');
    expect(goals).toContain('Could not update goal step. Try again.');
    expect(goals).toContain('Goal title is required.');
    expect(goals).toContain('const title = newGoal.title.trim();');
    expect(goals).toContain('const description = newGoal.description.trim();');
    expect(goals).toContain('axios.patch(`/api/goals/${goal._id}`, { steps })');
    expect(goals).toContain('First step (optional)');
    expect(goals).toContain('Add Step');
  });

  it('wires existing goal update and delete routes into the goals page', () => {
    const goals = read('frontend/src/GoalPage.jsx');
    const routes = read('routes/goals.js');

    expect(goals).toContain('startEdit');
    expect(goals).toContain('saveGoalEdit');
    expect(goals).toContain('deleteGoal');
    expect(goals).toContain('Save Changes');
    expect(goals).toContain('ConfirmButton');
    expect(goals).toContain('Confirm Delete');
    expect(goals).not.toContain('window.confirm');
    expect(goals).toContain('Could not save goal. Try again.');
    expect(goals).toContain('Could not delete goal. Try again.');
    expect(goals).toContain('const title = editDraft.title.trim();');
    expect(goals).toContain('const description = editDraft.description.trim();');
    expect(goals).toContain('axios.patch(`/api/goals/${goalId}`, { title, description })');
    expect(goals).toContain('axios.delete(`/api/goals/${goalId}`)');
    expect(routes).toContain("router.patch('/:id', auth");
    expect(routes).toContain("router.delete('/:id', auth");
    expect(routes).toContain('{ _id: req.params.id, userId: req.user.userId }');
  });

  it('keeps daily notes reachable through the date-based note contract', () => {
    const notesSection = read('frontend/src/NotesSection.jsx');
    const daily = read('frontend/src/DailyPage.jsx');
    const notesRoute = read('routes/notes.js');
    const server = read('server.js');

    expect(daily).toContain("import NotesSection from './NotesSection.jsx'");
    expect(daily).toContain('<NotesSection date={dateISO} />');
    expect(notesSection).toContain('axios.get(`/api/note/${date}`');
    expect(notesSection).toContain('axios.post(`/api/note/${targetDate}`');
    expect(notesRoute).toContain("router.get('/:date(\\\\d{4}-\\\\d{2}-\\\\d{2})'");
    expect(notesRoute).toContain("router.post('/:date(\\\\d{4}-\\\\d{2}-\\\\d{2})'");
    expect(notesRoute).toContain('Note.findOneAndUpdate');
    expect(notesRoute).toContain('unclusteredDateNoteQuery(userId, date)');
    expect(notesRoute).toContain('dateNoteUpsertQuery(userId, date, req.body, clusterIds)');
    expect(server).toContain("app.get('/api/note/:date(\\\\d{4}-\\\\d{2}-\\\\d{2})'");
    expect(server).toContain('unclusteredDateNoteQuery(userId, date)');
    expect(server).toContain('app.use("/api/notes", auth, noteRoutes)');
    expect(server).toContain('app.use("/api/note", auth, noteRoutes)');
    expect(notesSection).not.toContain('/api/notes/${date}');
  });

  it('keeps Task Inbox cleanup controls and source entry badges defined', () => {
    const inbox = read('frontend/src/pages/InboxTasksPage.jsx');

    expect(inbox).toContain('Move to Trash');
    expect(inbox).toContain('Move selected to Trash');
    expect(inbox).not.toContain('Archive');
    expect(inbox).not.toContain('Move selected to Archive');
    expect(inbox).toContain('📄 Entry (');
    expect(inbox).toContain('to={`/day/${t.entryId.date}`}');
  });
});
