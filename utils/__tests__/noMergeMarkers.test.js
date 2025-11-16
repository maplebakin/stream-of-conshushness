import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BINARY_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.bmp',
]);

describe('repository hygiene', () => {
  it('contains no merge conflict markers', () => {
    const root = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
    const files = execSync('git ls-files', { encoding: 'utf8' })
      .split('\n')
      .map((f) => f.trim())
      .filter(Boolean);
    const currentFile = path.relative(root, fileURLToPath(import.meta.url));

    const offenders = [];

    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      if (BINARY_EXTENSIONS.has(ext)) continue;
      if (file === currentFile) continue;

      const contents = readFileSync(path.join(root, file), 'utf8');
      if (contents.includes('<<<<<<<') || contents.includes('>>>>>>>')) {
        offenders.push(file);
      }
    }

    expect(offenders.length, offenders.length
      ? `Merge conflict markers found in: ${offenders.join(', ')}`
      : 'Expected no merge conflict markers'
    ).toBe(0);
  });
});
