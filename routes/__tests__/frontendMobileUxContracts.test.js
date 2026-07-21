import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (relativePath) => readFileSync(join(root, relativePath), 'utf8');

describe('authenticated mobile UX contracts', () => {
  it('provides a compact account-aware shell with safe-area navigation', () => {
    const shell = read('frontend/src/components/MobileShell.jsx');
    const shellCss = read('frontend/src/components/MobileShell.css');
    const header = read('frontend/src/Header.jsx');
    const mainCss = read('frontend/src/Main.css');

    for (const label of ['Stream', 'Today', 'Calendar']) expect(shell).toContain(`label: '${label}'`);
    expect(shell).toContain('aria-current={active ? \'page\' : undefined}');
    expect(shell).toContain('Sign out');
    expect(shell).not.toContain('Log Out');
    expect(header).toContain('<AccountMenu user={user} onSignOut={logout} />');
    expect(header).toContain('<MobileBottomNav />');
    expect(shellCss).toContain('env(safe-area-inset-bottom)');
    expect(mainCss).toContain('padding-bottom: calc(var(--space-8) + 4.4rem + env(safe-area-inset-bottom))');
  });

  it('keeps Stream capture first and discovery controls secondary', () => {
    const stream = read('frontend/src/MainPage.jsx');
    const streamCss = read('frontend/src/streampage.css');
    const summary = read('frontend/src/components/ReviewInboxSummary.jsx');

    const composer = stream.indexOf('quick-entry quick-entry--primary');
    expect(composer).toBeGreaterThan(-1);
    expect(composer).toBeLessThan(stream.indexOf('stream-review-summary'));
    expect(composer).toBeLessThan(stream.indexOf('summary="Recent activity"'));
    expect(composer).toBeLessThan(stream.indexOf('summary="Find or filter entries"'));
    expect(stream).toContain('placeholder="Capture a thought, task, or reminder…"');
    expect(stream).toContain('<ReviewInboxSummary');
    for (const label of ['Tasks', 'Ripples', 'Gather', 'Interests']) expect(summary).toContain(`label: '${label}'`);
    expect(streamCss).toContain('.stream-page .entry-feed > .quick-entry');
    expect(streamCss).toContain('.stream-page .entry-feed > .stream-filter-disclosure');
  });

  it('keeps Today date, agenda, capture, and carry settings in separate mobile layers', () => {
    const today = read('frontend/src/DailyPage.jsx');
    const todayCss = read('frontend/src/dailypage.css');

    expect(today).toContain('<MobileDateNavigator');
    expect(today).toContain('onPrevious={() => go(-1)}');
    expect(today).toContain('onNext={() => go(1)}');
    expect(today).toContain('showToday={dateISO !== todayISO}');
    expect(today).toContain('attentionSummary.earlierTasks.length > 0');
    expect(today).toContain('className="daily-add-menu"');
    expect(today).toContain('<NotesSection date={dateISO} />');
    expect(todayCss).toContain('.daily-page .daily-header {');
    expect(todayCss).toContain('display: contents;');
    expect(todayCss).toContain('.daily-page .daily-side {');
  });

  it('keeps Calendar grid-first with compact horizon details and selected-day access', () => {
    const calendar = read('frontend/src/Calendar.jsx');
    const calendarCss = read('frontend/src/Calendar.css');
    const horizon = read('frontend/src/components/OnTheHorizon.jsx');

    expect(calendar).toContain('getCalendarDay(selectedDate)');
    expect(calendar).toContain('className="calendar-cell');
    expect(calendar).toContain('aria-pressed={d ? isSelectedCell : undefined}');
    expect(calendar).toContain('className="calendar-selected-day"');
    expect(calendar).toContain('Open full day');
    expect(calendar).toContain('View source');
    expect(horizon).toContain('className="horizon-item__details"');
    expect(horizon).toContain('View details');
    expect(horizon).toContain('Show more');
    expect(horizon).toContain('sourceEntryPath(item)');
    expect(calendarCss).toContain('grid-template-rows: auto repeat(6, minmax(44px, auto));');
    expect(calendarCss).toContain('calendar-more');
    expect(calendarCss).toContain('overflow-x: clip');
  });

  it('defines the tested mobile widths without changing the desktop composition', () => {
    const headerCss = read('frontend/src/Header.css');
    const streamCss = read('frontend/src/streampage.css');
    const todayCss = read('frontend/src/dailypage.css');
    const calendarCss = read('frontend/src/Calendar.css');

    for (const width of [360, 390, 430]) {
      expect(`${streamCss}\n${todayCss}\n${calendarCss}`, `mobile breakpoint should cover ${width}px`).toContain('@media (max-width: 720px)');
    }
    expect(headerCss).toContain('@media (max-width: 720px)');
    expect(streamCss).toContain('@media (min-width: 721px)');
    expect(todayCss).toContain('@media (max-width: 720px)');
    expect(calendarCss).toContain('@media (max-width: 720px)');
  });
});
