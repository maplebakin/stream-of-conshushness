import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const frontendRoot = join(root, 'frontend/src');
const read = (path) => readFileSync(join(root, path), 'utf8');

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

describe('frontend legacy reference contracts', () => {
  it('keeps the current section route surfaces wired from App.jsx', () => {
    const app = read('frontend/src/App.jsx');
    const sectionsIndex = read('frontend/src/pages/SectionsIndex.jsx');
    const sectionPage = read('frontend/src/pages/SectionPage.jsx');
    const sectionPageRoom = read('frontend/src/pages/SectionPageRoom.jsx');

    expect(app).toContain("import SectionsIndex from './pages/SectionsIndex.jsx'");
    expect(app).toContain("import SectionPage from './pages/SectionPage.jsx'");
    expect(app).toContain("import SectionPageRoom from './pages/SectionPageRoom.jsx'");
    expect(app).toContain('path="/sections" element={<SectionsIndex />}');
    expect(app).toContain('path="/sections/:key" element={<SectionPage />}');
    expect(app).toContain('path="/sections/:sectionSlug/:pageSlug" element={<SectionPageRoom />}');
    expect(app).toContain('path="/sections/:sectionSlug/:pageSlug/:tab" element={<SectionPageRoom />}');

    expect(sectionsIndex).toContain('export default function SectionsIndex');
    expect(sectionPage).toContain('export default function SectionPage');
    expect(sectionPageRoom).toContain('export default function SectionPageRoom');
    expect(app).not.toContain('SectionLanding');
  });

  it('documents the active app shell and command palette references', () => {
    const app = read('frontend/src/App.jsx');
    const layout = read('frontend/src/Layout.jsx');
    const header = read('frontend/src/Header.jsx');
    const commandPalette = read('frontend/src/components/CommandPalette.jsx');

    expect(app).toContain("import Layout from './Layout.jsx'");
    expect(app).toContain("import CommandPalette from './components/CommandPalette.jsx'");
    expect(app).toContain('<CommandPalette');
    expect(app).toContain('<Route element={<Layout />}>');
    expect(layout).toContain("import Header from './Header.jsx'");
    expect(layout).toContain('<Header />');
    expect(layout).toContain('<Outlet />');
    expect(header).toContain('export default function Header');
    expect(commandPalette).toContain('export default function CommandPalette');

    expect(importedBy('frontend/src/Layout.jsx')).toEqual(['frontend/src/App.jsx']);
    expect(importedBy('frontend/src/Header.jsx')).toEqual([
      'frontend/src/GamePage.jsx',
      'frontend/src/Layout.jsx',
      'frontend/src/ManageSections.jsx',
    ]);
    expect(importedBy('frontend/src/components/CommandPalette.jsx')).toEqual(['frontend/src/App.jsx']);
    expect(importedBy('frontend/src/Sidebar.jsx')).toEqual([]);
    expect(app).not.toContain("from './Sidebar");
    expect(layout).not.toContain("from './Sidebar");
  });

  it('documents suspected legacy frontend files before cleanup', () => {
    const legacyCandidates = {
      'frontend/src/pages/SectionLanding.jsx': 'export default function SectionLanding',
      'frontend/src/Sidebar.jsx': 'export default function Sidebar',
      'frontend/src/EntriesSection.jsx': 'export default function EntriesSection',
      'frontend/src/ManageSections.jsx': 'export default function ManageSections',
    };

    for (const [path, exportSignature] of Object.entries(legacyCandidates)) {
      expect(read(path)).toContain(exportSignature);
      expect(importedBy(path)).toEqual([]);
    }
  });
});
