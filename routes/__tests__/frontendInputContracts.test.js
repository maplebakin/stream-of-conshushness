import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(process.cwd(), 'frontend/src');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

describe('user-facing input contracts', () => {
  it('uses the React Query v5 filter object when refreshing task controls', () => {
    const taskList = read('TaskList.jsx');
    expect(taskList).not.toContain("invalidateQueries(['tasks'])");
    expect(taskList).toContain("invalidateQueries({ queryKey: ['tasks'] })");
  });

  it('renders the shared application header only once on game detail pages', () => {
    const gamePage = read('GamePage.jsx');
    expect(gamePage).not.toContain("import Header from './Header.jsx'");
    expect(gamePage).not.toContain('<Header />');
  });

  it('makes game creation a guarded form with visible failure feedback', () => {
    const gameList = read('GameList.jsx');
    expect(gameList).toContain('onSubmit={handleAddGame}');
    expect(gameList).toContain('disabled={saving || !newTitle.trim()}');
    expect(gameList).toContain('role="alert"');
  });

  it('requires both event title and date before submitting', () => {
    const modal = read('adapters/ImportantEventModal.default.jsx');
    expect(modal).toContain('onSubmit={handleSave}');
    expect(modal).toContain('disabled={saving || !title.trim() || !date}');
  });

  it('does not expose unfinished section room tabs as interactive options', () => {
    const room = read('pages/SectionPageRoom.jsx');
    expect(room).toContain("const ALLOWED_TABS = ['journal']");
    expect(room).not.toContain('is coming online soon');
  });

  it('guards public authentication forms before network submission', () => {
    const login = read('Login.jsx');
    const register = read('RegisterPage.jsx');
    const forgot = read('pages/ForgotPassword.jsx');
    const reset = read('pages/ResetPassword.jsx');

    expect(login).toContain('disabled={loading || !username.trim() || !password}');
    expect(login).toContain('identifier: username.trim()');
    expect(register).toContain('disabled={loading || !canSubmit}');
    expect(forgot).toContain('disabled={loading || cooldown > 0 || !identifier.trim()}');
    expect(reset).toContain('disabled={disabled}');
  });

  it('guards settings changes and exposes backend validation messages', () => {
    const settings = read('pages/UserSettings.jsx');
    expect(settings).toContain('disabled={saving || !username.trim()}');
    expect(settings).toContain('disabled={pwBusy || !oldPassword || newPassword.length < 6}');
    expect(settings).toContain('e?.response?.data?.error || e.message');
  });
});
