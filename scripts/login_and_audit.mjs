// scripts/login_and_audit.mjs
// Usage:
// EMAIL="madison.alway@gmail.com" PASSWORD="testing123" API_BASE=http://127.0.0.1:3000 node scripts/login_and_audit.mjs

const API_BASE = process.env.API_BASE || 'http://127.0.0.1:3000';
const EMAIL = process.env.EMAIL;
const PASSWORD = process.env.PASSWORD;

if (!EMAIL || !PASSWORD) {
  console.error('Set EMAIL and PASSWORD env vars to login.');
  process.exit(2);
}

const loginPaths = ['/api/login', '/api/auth/login'];
const registerPaths = ['/api/register', '/api/auth/register'];

function usernameFromEmail(email) {
  const local = (email.split('@')[0] || 'user').toLowerCase();
  return local.replace(/[^a-z0-9._-]/g, '').replace(/^[-_.]+|[-_.]+$/g, '') || 'user';
}

async function j(url, opts = {}) {
  const r = await fetch(url, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) }
  }).catch(e => ({ _err: e.message, ok: false, status: 0, text: async () => '' }));
  if (!r || !r.status) return { status: 0, data: null, url };
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: r.status, data, url };
}

async function tryFirst(paths, body) {
  for (const p of paths) {
    const res = await j(`${API_BASE}${p}`, { method: 'POST', body });
    if (res.status !== 404 && res.status !== 0) return { ...res, path: p };
  }
  return { status: 404, data: null, path: paths[0] };
}

(async () => {
  const uname = usernameFromEmail(EMAIL);

  // Register: email+password only AND username+email — either should work with new auth
  const registerBodies = [
    JSON.stringify({ email: EMAIL, password: PASSWORD }),
    JSON.stringify({ username: uname, email: EMAIL, password: PASSWORD }),
    JSON.stringify({ identifier: EMAIL, password: PASSWORD }),
  ];

  let reg = null;
  for (const body of registerBodies) {
    reg = await tryFirst(registerPaths, body);
    if (reg.status === 200 || reg.status === 201 || reg.status === 409) break;
  }

  // Login attempts
  const loginBodies = [
    JSON.stringify({ email: EMAIL, password: PASSWORD }),
    JSON.stringify({ username: uname, password: PASSWORD }),
    JSON.stringify({ identifier: EMAIL, password: PASSWORD }),
  ];

  let login = null;
  for (const body of loginBodies) {
    const res = await tryFirst(loginPaths, body);
    if (res.status === 200 && res.data?.token) { login = res; break; }
  }

  if (!login) {
    console.error('Auth failed:', reg || '(no reg)', '→ then login attempts failed.');
    process.exit(1);
  }

  const TOKEN = login.data.token;
  console.log(`🔑 token via ${login.path} (${TOKEN.slice(0, 16)}…)\n`);

  const endpoints = [
    '/api/entries',
    '/api/tasks',
    '/api/appointments',
    '/api/events',
    '/api/notes',
    '/api/sections',
    '/api/section-pages',
    '/api/games',
    '/api/habits'
  ];

  for (const ep of endpoints) {
    const r = await fetch(`${API_BASE}${ep}`, {
      headers: { Authorization: `Bearer ${TOKEN}` }
    }).catch(() => ({ status: 0 }));
    const status = r?.status ?? 0;
    const verdict =
      status === 200 ? '✅ 200 OK'
      : status === 401 ? '🔒 401 (unexpected)'
      : status === 404 ? '❌ 404'
      : status >= 500 ? '💥 5xx'
      : `${status}`;
    console.log(`${ep.padEnd(22)} ${verdict}`);
  }
})();
