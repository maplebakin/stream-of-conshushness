import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const sourceRoot = path.resolve(scriptDir, '..');
const outputRoot = path.resolve(process.cwd(), process.argv[2] || 'deploy');

if (outputRoot === sourceRoot || outputRoot.startsWith(`${sourceRoot}${path.sep}frontend${path.sep}`)) {
  throw new Error('Deployment artifact output must not replace the repository or frontend tree.');
}
if (fs.existsSync(outputRoot)) {
  throw new Error(`Deployment artifact output already exists: ${outputRoot}`);
}

const artifactEntries = [
  ['frontend/dist', 'frontend/dist'],
  ['package.json', 'package.json'],
  ['package-lock.json', 'package-lock.json'],
  ['models', 'models'],
  ['routes', 'routes'],
  ['middleware', 'middleware'],
  ['services', 'services'],
  ['utils', 'utils'],
  ['scripts/migrations', 'scripts/migrations'],
  ['scripts/maintenanceSafety.mjs', 'scripts/maintenanceSafety.mjs'],
  ['scripts/verifyDeploymentServer.mjs', 'scripts/verifyDeploymentServer.mjs'],
  ['server.js', 'server.js'],
];

for (const [source] of artifactEntries) {
  if (!fs.existsSync(path.join(sourceRoot, source))) {
    throw new Error(`Deployment input is missing: ${source}`);
  }
}

function productionBundleContainsDevelopmentAdapter(root) {
  const pending = [root];
  while (pending.length) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const candidate = path.join(current, entry.name);
      if (entry.isDirectory()) {
        pending.push(candidate);
        continue;
      }
      if (!/\.(?:css|html|js|map)$/i.test(entry.name)) continue;
      const contents = fs.readFileSync(candidate, 'utf8');
      if (contents.includes('AdapterHarness') || contents.includes('/_adapters')) return true;
    }
  }
  return false;
}

try {
  fs.mkdirSync(outputRoot, { recursive: false });
  for (const [source, destination] of artifactEntries) {
    fs.cpSync(path.join(sourceRoot, source), path.join(outputRoot, destination), {
      recursive: true,
      errorOnExist: true,
    });
  }

  const builtFrontend = path.join(outputRoot, 'frontend', 'dist');
  if (productionBundleContainsDevelopmentAdapter(builtFrontend)) {
    throw new Error('Development adapter harness leaked into the production frontend.');
  }

  console.log(`Deployment artifact assembled at ${outputRoot}`);
} catch (error) {
  fs.rmSync(outputRoot, { recursive: true, force: true });
  throw error;
}
