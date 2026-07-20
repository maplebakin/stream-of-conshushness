import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (relativePath) => readFileSync(join(root, relativePath), 'utf8');

describe('frontend task safety contracts', () => {
  it('keeps the legacy ripple screen on standalone ripples only', () => {
    const source = read('frontend/src/RippleReviewUI.jsx');

    expect(source).toContain('standaloneRippleReviewPath(dayISO)');
    expect(source).not.toContain('axios.get(`/api/ripples/${dayISO}`');
    expect(source).not.toContain('`/api/ripples?date=${dayISO}`');
  });

  it('shows canonical task recurrence on Today and Task Inbox', () => {
    const todayTasks = read('frontend/src/TaskList.jsx');
    const inboxTasks = read('frontend/src/pages/InboxTasksPage.jsx');

    expect(todayTasks).toContain('taskRecurrenceLabel(t)');
    expect(todayTasks).toContain('Repeats: {recurrence}');
    expect(inboxTasks).toContain("rrule: typeof t.rrule === 'string' ? t.rrule : ''");
    expect(inboxTasks).toContain('taskRecurrenceLabel(t)');
    expect(inboxTasks).toContain('Repeats: {recurrence}');
  });

  it('guards every primary manual task creator before starting its request', () => {
    const modal = read('frontend/src/TaskModal.jsx');
    const todayTasks = read('frontend/src/TaskList.jsx');
    const inboxTasks = read('frontend/src/pages/InboxTasksPage.jsx');

    expect(modal).toContain('if (savingRef.current) return;');
    expect(modal).toContain('savingRef.current = true;');
    expect(modal).toContain("axios.post('/api/tasks'");
    expect(modal.indexOf('savingRef.current = true;')).toBeLessThan(modal.indexOf("axios.post('/api/tasks'"));
    expect(todayTasks).toContain('if (addingRef.current) return;');
    expect(todayTasks).toContain('addingRef.current = true;');
    expect(todayTasks).toContain("axios.post(\n        '/api/tasks'");
    expect(todayTasks.indexOf('addingRef.current = true;')).toBeLessThan(todayTasks.indexOf("axios.post(\n        '/api/tasks'"));
    expect(inboxTasks).toContain('if (creatingRef.current) return;');
    expect(inboxTasks).toContain('creatingRef.current = true;');
    expect(inboxTasks).toContain("axios.post('/api/tasks'");
    expect(inboxTasks.indexOf('creatingRef.current = true;')).toBeLessThan(inboxTasks.indexOf("axios.post('/api/tasks'"));
  });

  it('keeps TaskModal identified, focus-contained, dismissible, and focus-restoring', () => {
    const modal = read('frontend/src/TaskModal.jsx');

    expect(modal).toContain('role="dialog"');
    expect(modal).toContain('aria-modal="true"');
    expect(modal).toContain('aria-labelledby={titleId}');
    expect(modal).toContain("event.key === 'Escape'");
    expect(modal).toContain("event.key !== 'Tab'");
    expect(modal).toContain('previousFocus.focus()');
    expect(modal).toContain('titleInputRef.current?.focus()');
  });
});
