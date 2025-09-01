// Check ONLY React components (*.jsx). Ignore utilities like _pick.js and adapterMocks.js.

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const dir = path.join(root, 'frontend', 'src', 'adapters');

const files = fs.readdirSync(dir).filter(f => f.endsWith('.jsx'));

let bad = 0;
for (const f of files) {
  const p = path.join(dir, f);
  const src = fs.readFileSync(p, 'utf8');
  const hasDefault = /export\s+default\s+/.test(src);
  const hasReact = /from\s+['"]react['"]/.test(src);

  if (!hasDefault || !hasReact) {
    bad++;
    console.log(`❌ ${f} — default:${hasDefault ? 'yes' : 'NO'} react-import:${hasReact ? 'yes' : 'NO'}`);
  } else {
    console.log(`✅ ${f}`);
  }
}
process.exitCode = bad ? 1 : 0;
