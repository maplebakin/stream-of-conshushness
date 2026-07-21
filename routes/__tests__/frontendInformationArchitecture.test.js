import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

describe('authenticated information architecture', () => {
  it('keeps primary navigation compact, labeled, and account-oriented', () => {
    const header = read('frontend/src/Header.jsx');
    const mobileShell = read('frontend/src/components/MobileShell.jsx');
    const account = read('frontend/src/pages/Account.jsx');

    for (const label of ['Stream', 'Today', 'Calendar', 'Search', 'Review']) {
      expect(header).toContain(`label="${label}"`);
    }
    expect(header).toContain('AccountMenu');
    expect(header).toContain('MobileBottomNav');
    expect(mobileShell).toContain('<span>Account</span>');
    expect(mobileShell).toContain('Sign out');
    expect(header).not.toContain('Log Out');
    expect(mobileShell).not.toContain('Log Out');
    expect(account).toContain('Sign out');
    expect(account).toContain('onClick={logout}');
  });

  it('places Stream capture before review, filters, activity, and entries', () => {
    const stream = read('frontend/src/MainPage.jsx');
    const composer = stream.indexOf('quick-entry quick-entry--primary');

    expect(composer).toBeGreaterThan(0);
    expect(composer).toBeLessThan(stream.indexOf('stream-review-summary'));
    expect(composer).toBeLessThan(stream.indexOf('summary="Find or filter entries"'));
    expect(composer).toBeLessThan(stream.indexOf('<h2>Recent entries</h2>'));
    expect(composer).toBeLessThan(stream.indexOf('summary="Recent activity"'));
  });

  it('organizes Today around Now, due tasks, and disclosed secondary systems', () => {
    const today = read('frontend/src/DailyPage.jsx');

    expect(today).toContain('eyebrow="Now"');
    expect(today).toContain('What matters next?');
    expect(today).toContain('Due Today');
    expect(today).toContain('summary="On your radar"');
    expect(today).toContain('summary="Review details"');
    expect(today).toContain('aria-label="Day options"');
    expect(today).toContain('MobileDateNavigator');
    expect(today).toContain('showToday={dateISO !== todayISO}');
    expect(today).not.toContain('summary="Day options"');
    expect(today).not.toContain('Carry-forward is off');
    expect(today).toContain('Automatic carry-forward:');
    expect(today).toContain('Carry earlier tasks to today now');
  });

  it('renders the month before horizon management and uses a single Add choice', () => {
    const calendar = read('frontend/src/Calendar.jsx');

    expect(calendar.indexOf('className="calendar-grid"')).toBeLessThan(calendar.indexOf('<OnTheHorizon'));
    expect(calendar).toContain('+ Add');
    expect(calendar).toContain('Today is {humanToday}');
    expect(calendar).not.toContain('<span className="subtitle">{tzToday}</span>');
  });

  it('reveals account verification only after the flow begins', () => {
    const account = read('frontend/src/pages/Account.jsx');

    expect(account).toContain('No recovery email added.');
    expect(account).toContain('{verificationStarted && (');
    const revealedFlow = account.slice(account.indexOf('{verificationStarted && ('));
    expect(revealedFlow).toContain('<span>Verification code</span>');
    expect(revealedFlow).toContain('confirmEmailCode');
  });

  it('uses shared calm empty and disclosure patterns on recovery and review pages', () => {
    const search = read('frontend/src/pages/GlobalSearch.jsx');
    const review = read('frontend/src/pages/ReviewInbox.jsx');

    expect(search).toContain('CalmEmptyState');
    expect(search).toContain('summary="Narrow the search"');
    expect(review).toContain('CalmEmptyState');
    expect(review).toContain('summary="Filter or work in bulk"');
  });
});
