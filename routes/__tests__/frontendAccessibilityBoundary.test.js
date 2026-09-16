import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

describe('frontend accessibility and experimental feature boundaries', () => {
  it('provides a skip target without nesting main landmarks', () => {
    const layout = read('frontend/src/Layout.jsx');

    expect(layout).toContain('href="#main-content"');
    expect(layout).toContain('routeProvidesMainLandmark(pathname)');
    expect(layout).toContain("const ContentRoot = routeProvidesMainLandmark(pathname) ? 'div' : 'main';");
    expect(layout).toContain('<ContentRoot id="main-content"');
    expect(layout).not.toContain('<main className="app-main">');
  });

  it('makes the command palette an identified, focus-contained dialog', () => {
    const palette = read('frontend/src/components/CommandPalette.jsx');

    expect(palette).toContain('role="dialog"');
    expect(palette).toContain('aria-modal="true"');
    expect(palette).toContain('aria-labelledby="command-palette-title"');
    expect(palette).toContain("e.key === 'Tab'");
    expect(palette).toContain('previousFocusRef.current.focus()');
  });

  it('keeps unfinished streak analytics out of public navigation without deleting habit data support', () => {
    const app = read('frontend/src/App.jsx');
    const header = read('frontend/src/Header.jsx');
    const layout = read('frontend/src/Layout.jsx');
    const palette = read('frontend/src/components/CommandPalette.jsx');
    const daily = read('frontend/src/DailyPage.jsx');
    const habitRoutes = read('routes/habits.js');
    const server = read('server.js');

    expect(app).not.toContain("import('./pages/HabitAnalytics.jsx')");
    expect(app).toContain('path="/habits/analytics" element={<Navigate to="/today" replace />}');
    expect(header).not.toContain('to="/habits/analytics"');
    expect(layout).not.toContain('to="/habits/analytics"');
    expect(palette).not.toContain("target: '/habits/analytics'");
    expect(daily).not.toContain('Coming in Phase 4.');

    expect(habitRoutes).toContain("router.get('/', auth");
    expect(habitRoutes).toContain("router.get('/analytics', auth");
    expect(server).toContain('app.use("/api/habits", auth, habitRoutes)');
  });
});
