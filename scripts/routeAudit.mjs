// scripts/routeAudit.mjs
// Run: node scripts/routeAudit.mjs
import fs from 'fs/promises';
import path from 'path';

const ROOT = process.cwd();
const ROUTES_DIR = path.join(ROOT, 'routes');
const SERVER_JS = path.join(ROOT, 'server.js');
const FRONT_DIR = path.join(ROOT, 'frontend', 'src');

const HTTP = ['get','post','put','patch','delete','options','head'];

function normalizeDynamicSegments(p){
  return p.replace(/\/:[^/]+/g, '/*'); // :param -> *
}
function collapseStars(s){
  // /foo/**  -> /foo/*
  // /foo/*/* -> /foo/*
  // /foo/*/** -> /foo/*
  return s.replace(/(?:\/\*+)+(?![^/])/g, '/*').replace(/(?:\/\*+)+(?=\/)/g, '/*');
}
function norm(p){
  if (!p) return p;
  let s = p.replace(/\?.*$/, '');     // strip query
  s = s.replace(/\/{2,}/g, '/');      // collapse //
  if (s.length > 1 && s.endsWith('/')) s = s.slice(0, -1);
  s = collapseStars(s);
  s = normalizeDynamicSegments(s);
  return s;
}

async function readText(file){
  try { return await fs.readFile(file, 'utf8'); }
  catch { return ''; }
}

async function listFiles(dir, exts = ['.js', '.jsx', '.ts', '.tsx']){
  const out = [];
  async function walk(d){
    const entries = await fs.readdir(d, { withFileTypes: true });
    for (const e of entries){
      const fp = path.join(d, e.name);
      if (e.isDirectory()) await walk(fp);
      else if (exts.includes(path.extname(e.name))) out.push(fp);
    }
  }
  await walk(dir);
  return out;
}

// Map router identifiers -> routes file basenames (ESM + CJS)
function parseRouteImports(serverCode){
  const idToFile = new Map();
  const reImpDef = /import\s+(?<id>[a-zA-Z_$][\w$]*)\s+from\s+['"]\.\/routes\/(?<file>[^'"]+)['"]/g;
  for (const m of serverCode.matchAll(reImpDef)){
    idToFile.set(m.groups.id, m.groups.file.replace(/\.(js|mjs|cjs)$/i,''));
  }
  const reReq = /const\s+(?<id>[a-zA-Z_$][\w$]*)\s*=\s*require\(\s*['"]\.\/routes\/(?<file>[^'"]+)['"]\s*\)/g;
  for (const m of serverCode.matchAll(reReq)){
    idToFile.set(m.groups.id, m.groups.file.replace(/\.(js|mjs|cjs)$/i,''));
  }
  return idToFile;
}

// Grab app.use('/api...' , <id>) and resolve <id> to a routes file if possible
function parseMounts(serverCode, idToFile){
  const mounts = [];
  const reUse = /app\.use\(\s*['"](?<mount>\/api(?:\/[^'"]*)?)['"]\s*,\s*(?<rest>[^)]+)\)/g; // <-- accepts '/api' too
  for (const m of serverCode.matchAll(reUse)){
    const mount = norm(m.groups.mount.trim());
    const ids = m.groups.rest.split(/[^a-zA-Z0-9_$]+/).filter(Boolean);
    let file = null;
    for (let i = ids.length - 1; i >= 0; i--){
      const id = ids[i];
      if (idToFile.has(id)) { file = idToFile.get(id); break; }
    }
    mounts.push({ mount, file }); // file may be null (e.g., utils/upload.js)
  }
  return mounts;
}

function parseRoutes(code){
  const endpoints = new Set();

  // router.METHOD('/x')
  for (const method of HTTP){
    const re = new RegExp(`router\\.${method}\\(\\s*['"]([^'"]+)['"]`, 'g');
    for (const m of code.matchAll(re)){
      let p = m[1] || '/';
      if (!p.startsWith('/')) p = `/${p}`;
      endpoints.add(norm(p));
    }
  }

  // router.use('/subpath', ...)  -> treat as a prefix: include '/subpath/*'
  for (const m of code.matchAll(/router\.use\(\s*['"]([^'"]+)['"]/g)){
    let p = m[1] || '/';
    if (!p.startsWith('/')) p = `/${p}`;
    p = norm(p);
    if (p !== '/') {
      endpoints.add(p);
      endpoints.add(norm(`${p}/*`)); // key addition so '/note' implies '/note/*'
    }
  }

  if (endpoints.size === 0) endpoints.add('/');
  return [...endpoints];
}

function joinURL(a,b){
  const u = `${a.replace(/\/+$/,'')}/${b.replace(/^\/+/, '')}`;
  return norm(u);
}

async function getBackendEndpoints(){
  const serverCode = await readText(SERVER_JS);
  const idToFile = parseRouteImports(serverCode);
  const mounts = parseMounts(serverCode, idToFile);

  let routeFiles = [];
  try { routeFiles = await fs.readdir(ROUTES_DIR); } catch { /* no routes dir */ }

  const mapFileToMount = new Map();
  const looseMounts = new Set();

  for (const { mount, file } of mounts){
    if (file) mapFileToMount.set(file, mount);
    else looseMounts.add(mount); // base path known but file isn't under /routes
  }

  for (const name of routeFiles){
    const base = name.replace(/\.(js|mjs|cjs)$/i,'');
    if (!mapFileToMount.has(base)){
      mapFileToMount.set(base, norm(`/api/${base}`));
    }
  }

  const backend = new Set();

  for (const [base, mount] of mapFileToMount.entries()){
    const filePath = path.join(ROUTES_DIR, `${base}.js`);
    const code = await readText(filePath);
    const subs = parseRoutes(code);
    for (const sub of subs) backend.add(joinURL(mount, sub));
  }

  for (const m of looseMounts){
    backend.add(norm(m));
  }

  return [...backend].sort();
}

// Strictly capture strings that START with /api (quotes or template literals)
async function getFrontendEndpoints(){
  const files = await listFiles(FRONT_DIR, ['.js','.jsx','.ts','.tsx']);
  const hits = new Set();
  const reStr = /['"](?<path>\/api\/[^'"]+)['"]/g;
  const reTpl = /`(?<path>\/api\/[^`]+)`/g;

  for (const fp of files){
    const code = await readText(fp);

    for (const m of code.matchAll(reStr)){
      hits.add(norm(m.groups.path));
    }
    for (const m of code.matchAll(reTpl)){
      const raw = m.groups.path.replace(/\$\{[^}]+\}/g, '*');
      hits.add(norm(raw));
    }
  }
  return [...hits].sort();
}

function diff(frontArr, backArr){
  const a = new Set(frontArr);
  const b = new Set(backArr);
  const aOnly = [...a].filter(x=>!b.has(x)).sort();
  const bOnly = [...b].filter(x=>!a.has(x)).sort();
  return { aOnly, bOnly };
}

(async ()=>{
  try {
    const [back, front] = await Promise.all([getBackendEndpoints(), getFrontendEndpoints()]);
    console.log('=== Backend endpoints (derived) ===');
    console.log(back.join('\n') || '(none)');
    console.log('\n=== Frontend endpoints (found in code) ===');
    console.log(front.join('\n') || '(none)');

    const { aOnly: frontOnly, bOnly: backOnly } = diff(front, back);
    console.log('\n=== POSSIBLE 404 RISKS — used in front but not provided in back ===');
    console.log(frontOnly.join('\n') || '(none)');
    console.log('\n=== POSSIBLE DEAD ENDPOINTS — provided in back but unused in front ===');
    console.log(backOnly.join('\n') || '(none)');
  } catch (e){
    console.error('Route audit failed:', e);
    process.exit(1);
  }
})();
