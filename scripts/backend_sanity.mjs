// scripts/backend_sanity.mjs
// Run: API_BASE=http://localhost:3000 TOKEN=xxxx node scripts/backend_sanity.mjs
const API_BASE = process.env.API_BASE || 'http://localhost:3000';
const TOKEN = process.env.TOKEN || null;

const endpoints = [
  '/health',
  '/api/entries',
  '/api/tasks',
  '/api/appointments',
  '/api/events',
  '/api/notes',
  '/api/sections',
  '/api/section-pages',
  '/api/games',
  '/api/habits',
  '/graphql'
];

const timeout = (ms) => new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms));

async function hit(path, auth = false, method = 'GET') {
  const url = `${API_BASE}${path}`;
  const headers = {};
  if (auth && TOKEN) headers.Authorization = `Bearer ${TOKEN}`;
  if (path === '/graphql' && method === 'POST') headers['Content-Type'] = 'application/json';

  const body = path === '/graphql' && method === 'POST'
    ? JSON.stringify({ query: '{ __typename }' })
    : undefined;

  const controller = new AbortController();
  const started = Date.now();

  const p = fetch(url, { method, headers, body, signal: controller.signal })
    .then(async (r) => ({
      url, status: r.status, ok: r.ok, ms: Date.now() - started
    }))
    .catch((e) => ({
      url, status: 0, ok: false, ms: Date.now() - started, error: e.message
    }));

  try {
    return await Promise.race([p, timeout(6000)]);
  } catch (e) {
    return { url, status: 0, ok: false, ms: Date.now() - started, error: 'timeout' };
  } finally {
    controller.abort();
  }
}

function verdict(r) {
  if (r.status === 0) return `🕳️ no response (${r.error || 'net'})`;
  if (r.status === 404) return '❌ 404 missing';
  if (r.status >= 500) return '💥 server error';
  if (r.status === 401 || r.status === 403) return '🔒 protected';
  if (r.status === 200 || r.status === 405) return '✅ present';
  return `${r.status} seen`;
}

(async () => {
  console.log(`\n🔎 Backend sanity @ ${API_BASE}\n`);

  const rows = [];
  for (const ep of endpoints) {
    const method = ep === '/graphql' ? 'POST' : 'GET';
    const unauth = await hit(ep, false, method);
    const withAuth = TOKEN ? await hit(ep, true, method) : null;
    rows.push({ ep, unauth, withAuth });
  }

  const pad = (s, n) => String(s).padEnd(n);
  const w1 = 26, w2 = 28, w3 = 28;
  console.log(pad('Endpoint', w1), pad('Unauth', w2), pad('With Auth', w3));
  console.log('-'.repeat(w1 + w2 + w3));
  for (const { ep, unauth, withAuth } of rows) {
    const u = `${unauth.status || '—'} ${verdict(unauth)} ${unauth.ms}ms`;
    const a = withAuth ? `${withAuth.status || '—'} ${verdict(withAuth)} ${withAuth.ms}ms` : '— (no TOKEN)';
    console.log(pad(ep, w1), pad(u, w2), pad(a, w3));
  }

  const hardFailures = rows.filter(r =>
    r.unauth.status === 0 && (!r.withAuth || r.withAuth.status === 0)
  );
  const missing = rows.filter(r =>
    r.unauth.status === 404 && (!r.withAuth || r.withAuth.status === 404)
  );

  if (hardFailures.length) {
    console.log('\n⛔ Backend unreachable for these endpoints (no TCP/HTTP response):');
    for (const m of hardFailures) console.log('  -', m.ep);
    console.log('\nHints: is the server running? correct API_BASE? port bound?');
    process.exitCode = 2;
    return;
  }

  if (missing.length) {
    console.log('\n⚠️ Missing routes (404 both unauth and auth):');
    for (const m of missing) console.log('  -', m.ep);
    process.exitCode = 1;
  } else {
    console.log('\n✨ Routes respond (or are protected).');
  }
})();
