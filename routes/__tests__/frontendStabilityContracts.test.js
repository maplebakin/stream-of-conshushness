import { readFileSync } from 'node:fs';
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

  it('keeps header, layout, and command palette navigation aligned with current routes', () => {
    const app = read('frontend/src/App.jsx');
    const header = read('frontend/src/Header.jsx');
    const layout = read('frontend/src/Layout.jsx');
    const commandPalette = read('frontend/src/components/CommandPalette.jsx');

    expect(header).toContain('to="/goals"');
    expect(header).toContain('Goals');

    for (const target of ['/', '/sections', '/clusters', '/ripples', '/inbox/tasks', '/calendar', '/search', '/trash', '/export', '/account', '/settings']) {
      expect(layout).toContain(`to="${target}"`);
    }

    for (const target of ['/', '/today', '/calendar', '/goals', '/sections', '/clusters', '/ripples', '/habits/analytics', '/search', '/export', '/trash', '/account', '/settings']) {
      expect(commandPalette).toContain(`target: '${target}'`);
      if (target === '/today') {
        expect(app).toContain('path="/today" element={<TodayRedirect />}');
      } else {
        expect(app).toContain(`path="${target}"`);
      }
    }
  });

  it('documents currently unreachable legacy frontend surfaces before cleanup', () => {
    const app = read('frontend/src/App.jsx');
    const sectionLanding = read('frontend/src/pages/SectionLanding.jsx');
    const sidebar = read('frontend/src/Sidebar.jsx');
    const entriesSection = read('frontend/src/EntriesSection.jsx');
    const manageSections = read('frontend/src/ManageSections.jsx');

    // Documentation guard: these files exist, but are not currently routed directly from App.jsx.
    expect(sectionLanding).toContain('export default function SectionLanding');
    expect(sidebar).toContain('export default function Sidebar');
    expect(entriesSection).toContain('export default');
    expect(manageSections).toContain('export default function ManageSections');
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
    expect(daily).toContain('getAppointmentDeleteConfirmation');
  });

  it('keeps appointment display details and controls visible in calendar and day views', () => {
    const helper = read('frontend/src/utils/appointmentIds.js');
    const calendar = read('frontend/src/Calendar.jsx');
    const daily = read('frontend/src/DailyPage.jsx');

    expect(helper).toContain('getAppointmentDetailParts');
    expect(helper).toContain("parts.push('Recurring')");
    expect(calendar).toContain('getAppointmentDetailParts(ap)');
    expect(calendar).toContain('ap.details');
    expect(calendar).toContain('openEditAppointment(ap)');
    expect(calendar).toContain('deleteAppointment(ap)');
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

    expect(app).toContain("import GoalPage from './GoalPage.jsx'");
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
    expect(goals).toContain('Delete this goal?');
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
    expect(notesSection).toContain('axios.post(`/api/note/${date}`');
    expect(notesRoute).toContain("router.get('/:date(\\\\d{4}-\\\\d{2}-\\\\d{2})'");
    expect(notesRoute).toContain("router.post('/:date(\\\\d{4}-\\\\d{2}-\\\\d{2})'");
    expect(notesRoute).toContain('Note.findOneAndUpdate');
    expect(notesRoute).toContain('{ ...own(userId), date }');
    expect(server).toContain("app.get('/api/note/:date(\\\\d{4}-\\\\d{2}-\\\\d{2})'");
    expect(server).toContain('app.use("/api/notes", auth, noteRoutes)');
    expect(server).toContain('app.use("/api/note", auth, noteRoutes)');
    expect(notesSection).not.toContain('/api/notes/${date}');
  });
});
