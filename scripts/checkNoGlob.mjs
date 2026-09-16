import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const lockfiles = [
  { label: 'root', path: resolve('package-lock.json') },
  { label: 'frontend', path: resolve('frontend/package-lock.json') },
];

function packageNameFromLockPath(lockPath) {
  const marker = 'node_modules/';
  const markerIndex = lockPath.lastIndexOf(marker);

  if (markerIndex === -1) {
    return null;
  }

  const packagePath = lockPath.slice(markerIndex + marker.length);
  const [first, second] = packagePath.split('/');

  if (!first) {
    return null;
  }

  return first.startsWith('@') ? `${first}/${second}` : first;
}

function collectLegacyDependencyMatches(dependencies = {}, trail = []) {
  return Object.entries(dependencies).flatMap(([name, metadata]) => {
    const nextTrail = [...trail, name];
    const nestedMatches = collectLegacyDependencyMatches(
      metadata?.dependencies,
      nextTrail,
    );

    return name === 'glob'
      ? [nextTrail.join(' > '), ...nestedMatches]
      : nestedMatches;
  });
}

const matches = lockfiles.flatMap(({ label, path }) => {
  const lockfile = JSON.parse(readFileSync(path, 'utf8'));
  const packageMatches = Object.keys(lockfile.packages ?? {})
    .filter((lockPath) => packageNameFromLockPath(lockPath) === 'glob')
    .map((lockPath) => `${label}:${lockPath}`);
  const legacyMatches = collectLegacyDependencyMatches(lockfile.dependencies)
    .map((dependencyPath) => `${label}:${dependencyPath}`);

  return [...packageMatches, ...legacyMatches];
});

if (matches.length > 0) {
  console.error('glob is still present in lockfiles:');
  matches.forEach((match) => console.error(`- ${match}`));
  process.exit(1);
}

console.log('No glob dependency found in root or frontend lockfiles.');
