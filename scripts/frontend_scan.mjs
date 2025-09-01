// scripts/frontend_scan.mjs
// Run: node scripts/frontend_scan.mjs
import { promises as fs } from 'node:fs';
import path from 'node:path';
const SRC = path.resolve('frontend', 'src');

const EXT = ['.jsx', '.js', '.tsx', '.ts'];
const seenFiles = new Set();
const missingImports = new Map();
const buckets = { adapters: [], pages: [], components: [], other: [] };

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) await walk(p);
    else if (/\.(jsx?|tsx?)$/.test(e.name)) {
      seenFiles.add(p);
      bucket(p);
      await scanImports(p);
    }
  }
}

function bucket(p) {
  const rel = path.relative(SRC, p);
  if (rel.startsWith('adapters/')) buckets.adapters.push(rel);
  else if (rel.startsWith('pages/')) buckets.pages.push(rel);
  else if (rel.startsWith('components/')) buckets.components.push(rel);
  else buckets.other.push(rel);
}

async function scanImports(file) {
  const text = await fs.readFile(file, 'utf8');
  const dir = path.dirname(file);
  const regex = /^\s*import[\s\S]*?from\s+['"](.+?)['"]/gm;
  let m;
  while ((m = regex.exec(text))) {
    const spec = m[1];
    if (!spec.startsWith('.')) continue; // only relative paths
    if (!(await resolveImport(dir, spec))) {
      const rel = path.relative(SRC, file);
      if (!missingImports.has(rel)) missingImports.set(rel, []);
      missingImports.get(rel).push(spec);
    }
  }
}

async function resolveImport(fromDir, spec) {
  const tryPaths = [];
  // direct file with or without extension
  if (path.extname(spec)) {
    tryPaths.push(path.resolve(fromDir, spec));
  } else {
    for (const ext of EXT) tryPaths.push(path.resolve(fromDir, spec + ext));
    // folder index
    for (const ext of EXT) tryPaths.push(path.resolve(fromDir, spec, 'index' + ext));
  }
  for (const p of tryPaths) {
    try { const s = await fs.stat(p); if (s.isFile()) return true; } catch {}
  }
  return false;
}

function list(title, arr) {
  console.log(`\n${title} (${arr.length})`);
  for (const a of arr.sort()) console.log('  -', a);
}

try {
  await walk(SRC);
  console.log(`\n🧭 Frontend scan @ ${SRC}`);
  list('Adapters', buckets.adapters);
  list('Pages', buckets.pages);
  list('Components', buckets.components);

  if (missingImports.size) {
    console.log('\n⚠️  Missing relative imports detected:');
    for (const [file, specs] of missingImports) {
      console.log(`  In ${file}:`);
      for (const s of specs) console.log('    →', s);
    }
    process.exitCode = 1;
  } else {
    console.log('\n✨ No missing relative imports found.');
  }
} catch (e) {
  console.error('Scan failed:', e.message);
  process.exit(2);
}
