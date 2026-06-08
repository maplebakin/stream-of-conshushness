import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const frontendRoot = join(root, 'frontend/src');
const read = (path) => readFileSync(join(root, path), 'utf8');
const exists = (path) => existsSync(join(root, path));

function listSourceFiles(dir = frontendRoot) {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) return listSourceFiles(fullPath);
    return /\.(jsx?|tsx?)$/.test(entry) ? [fullPath] : [];
  });
}

function importSourcesForFile(filePath) {
  const source = readFileSync(filePath, 'utf8');
  return [...source.matchAll(/^\s*import\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"];?/gm)]
    .map((match) => match[1])
    .filter((specifier) => specifier.startsWith('.'));
}

function resolveImport(fromFile, specifier) {
  const base = resolve(dirname(fromFile), specifier);
  const candidates = [
    base,
    `${base}.jsx`,
    `${base}.js`,
    join(base, 'index.jsx'),
    join(base, 'index.js'),
  ];
  return candidates.find((candidate) => existsSync(candidate)) || base;
}

function importedBy(targetRelativePath) {
  const target = join(root, targetRelativePath);
  return listSourceFiles()
    .filter((filePath) => filePath !== target)
    .filter((filePath) =>
      importSourcesForFile(filePath).some((specifier) => resolveImport(filePath, specifier) === target),
    )
    .map((filePath) => relative(root, filePath).replaceAll('\\', '/'))
    .sort();
}

describe('frontend duplicate component reference contracts', () => {
  it('documents EntryModal root usage versus the adapter default', () => {
    const daily = read('frontend/src/DailyPage.jsx');
    const adapterIndex = read('frontend/src/adapters/index.js');

    // Canonical product component: used by routed product pages.
    expect(importedBy('frontend/src/EntryModal.jsx')).toEqual([
      'frontend/src/DailyPage.jsx',
      'frontend/src/MainPage.jsx',
      'frontend/src/pages/ClusterRoom.jsx',
    ]);
    expect(daily).toContain("import EntryModal from './EntryModal.jsx'");

    // Harness-only adapter: registered through adapters/index.js for /_adapters.
    expect(importedBy('frontend/src/adapters/EntryModal.default.jsx')).toEqual([
      'frontend/src/adapters/index.js',
    ]);
    expect(adapterIndex).toContain("import EntryModal from './EntryModal.default.jsx'");
  });

  it('documents TaskList root usage versus the section adapter default', () => {
    const daily = read('frontend/src/DailyPage.jsx');
    const sectionPage = read('frontend/src/pages/SectionPage.jsx');
    const sectionPageRoom = read('frontend/src/pages/SectionPageRoom.jsx');
    const adapterIndex = read('frontend/src/adapters/index.js');

    // Canonical daily product component.
    expect(importedBy('frontend/src/TaskList.jsx')).toEqual(['frontend/src/DailyPage.jsx']);
    expect(daily).toContain("import TaskList from './TaskList.jsx'");

    // Product-used adapter: still used by current section routes and by the harness.
    expect(importedBy('frontend/src/adapters/TaskList.default.jsx')).toEqual([
      'frontend/src/adapters/index.js',
      'frontend/src/pages/SectionPage.jsx',
      'frontend/src/pages/SectionPageRoom.jsx',
    ]);
    expect(sectionPage).toContain("import TaskList from '../adapters/TaskList.default.jsx'");
    expect(sectionPageRoom).toContain("import TaskList from '../adapters/TaskList.default.jsx'");
    expect(adapterIndex).toContain("import TaskList from './TaskList.default.jsx'");
  });

  it('documents DailyRipples root, alternate component, and adapter usage', () => {
    const daily = read('frontend/src/DailyPage.jsx');
    const component = read('frontend/src/components/DailyRipples.jsx');
    const adapterIndex = read('frontend/src/adapters/index.js');

    // Canonical daily product component.
    expect(importedBy('frontend/src/DailyRipples.jsx')).toEqual(['frontend/src/DailyPage.jsx']);
    expect(daily).toContain("import DailyRipples from './DailyRipples.jsx'");

    // Unused alternate component: present but not imported by current runtime files.
    expect(component).toContain('export default function DailyRipples');
    expect(importedBy('frontend/src/components/DailyRipples.jsx')).toEqual([]);

    // Harness-only adapter.
    expect(importedBy('frontend/src/adapters/DailyRipples.default.jsx')).toEqual([
      'frontend/src/adapters/index.js',
    ]);
    expect(adapterIndex).toContain("import DailyRipples from './DailyRipples.default.jsx'");
  });

  it('documents AnalyzeEntryButton component versus adapter usage', () => {
    const daily = read('frontend/src/DailyPage.jsx');
    const adapterIndex = read('frontend/src/adapters/index.js');

    // Removed legacy alternate component: current analyze flow uses the ripple adapter below.
    expect(exists('frontend/src/components/AnalyzeEntryButton.jsx')).toBe(false);

    // Product-used adapter: DailyPage uses this adapter directly, and the harness registers it.
    expect(importedBy('frontend/src/adapters/AnalyzeEntryButton.default.jsx')).toEqual([
      'frontend/src/DailyPage.jsx',
      'frontend/src/adapters/index.js',
    ]);
    expect(daily).toContain("import AnalyzeEntryButton from './adapters/AnalyzeEntryButton.default.jsx'");
    expect(adapterIndex).toContain("import AnalyzeEntryButton from './AnalyzeEntryButton.default.jsx'");
  });

  it('documents EntryQuickAssign component versus adapter usage', () => {
    const daily = read('frontend/src/DailyPage.jsx');
    const adapterIndex = read('frontend/src/adapters/index.js');

    // Removed legacy alternate component: dropdown behavior now lives in the canonical adapter.
    expect(exists('frontend/src/components/EntryQuickAssign.jsx')).toBe(false);

    // Product-used adapter: DailyPage uses this adapter directly, and the harness registers it.
    expect(importedBy('frontend/src/adapters/EntryQuickAssign.default.jsx')).toEqual([
      'frontend/src/DailyPage.jsx',
      'frontend/src/adapters/index.js',
    ]);
    expect(daily).toContain("import EntryQuickAssign from './adapters/EntryQuickAssign.default.jsx'");
    expect(adapterIndex).toContain("import EntryQuickAssign from './EntryQuickAssign.default.jsx'");

    const adapter = read('frontend/src/adapters/EntryQuickAssign.default.jsx');
    expect(adapter).toContain("axios.get('/api/clusters'");
    expect(adapter).toContain('function normalizeClusters');
    expect(adapter).toContain('<select');
    expect(adapter).toContain('<option value="">No cluster</option>');
    expect(adapter).toContain("axios.patch(`/api/entries/${entry._id}`, { cluster: nextCluster }");
    expect(adapter).toContain("axios.post(\n        '/api/tasks'");
    expect(adapter).toContain('/link-entry');
    expect(adapter).not.toContain('/api/tasks/from-entry');
  });

  it('keeps the adapter harness route and registry documented', () => {
    const app = read('frontend/src/App.jsx');
    const harness = read('frontend/src/adapters/AdapterHarness.jsx');
    const adapterIndex = read('frontend/src/adapters/index.js');

    expect(app).toContain("import AdapterHarness from './adapters/AdapterHarness.jsx'");
    expect(app).toContain('path="/_adapters" element={<AdapterHarness />}');
    expect(importedBy('frontend/src/adapters/AdapterHarness.jsx')).toEqual(['frontend/src/App.jsx']);
    expect(harness).toContain("import ADAPTERS from './index.js'");
    expect(adapterIndex).toContain('export const ADAPTERS = {');
  });
});
