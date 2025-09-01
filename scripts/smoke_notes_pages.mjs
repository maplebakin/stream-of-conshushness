// scripts/smoke_notes_pages.mjs
// Usage:
// EMAIL="you@example.com" PASSWORD="pass" API_BASE=http://127.0.0.1:3000 node scripts/smoke_notes_pages.mjs

const API_BASE = process.env.API_BASE || 'http://127.0.0.1:3000';
const EMAIL = process.env.EMAIL;
const PASSWORD = process.env.PASSWORD;

if (!EMAIL || !PASSWORD) {
  console.error('Set EMAIL and PASSWORD env vars.');
  process.exit(2);
}

const loginPaths = ['/api/login', '/api/auth/login'];

async function j(url, opts = {}) {
  try {
    const r = await fetch(url, {
      ...opts,
      headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) }
    });
    const text = await r.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { status: r.status, data, url };
  } catch (e) {
    return { status: 0, data: { error: e.message }, url };
  }
}

async function tryFirst(paths, body) {
  for (const p of paths) {
    const res = await j(`${API_BASE}${p}`, { method: 'POST', body });
    if (res.status !== 404 && res.status !== 0) return { ...res, path: p };
  }
  return { status: 404, data: null, path: paths[0] };
}

function log(step, ok, detail = '') {
  const mark = ok ? '✅' : '❌';
  console.log(`${mark} ${step}${detail ? ` — ${detail}` : ''}`);
}

(async () => {
  // Login
  const loginBody = JSON.stringify({ email: EMAIL, password: PASSWORD });
  const login = await tryFirst(loginPaths, loginBody);
  if (login.status !== 200 || !login.data?.token) {
    console.error('Auth failed:', login);
    process.exit(1);
  }
  const TOKEN = login.data.token;
  const H = { Authorization: `Bearer ${TOKEN}` };

  // ---- NOTES CRUD ----
  let noteId = null;
  {
    // Create
    const create = await j(`${API_BASE}/api/notes`, {
      method: 'POST',
      headers: H,
      body: JSON.stringify({
        title: '__smoke_note__',
        content: 'This is a smoke note created by scripts/smoke_notes_pages.mjs',
        tags: ['__smoke__','notes'],
      })
    });
    log('notes.create', create.status === 201, `status=${create.status}`);
    noteId = create.data?.item?._id;

    // List
    const list = await j(`${API_BASE}/api/notes`, { headers: H });
    const seen = Array.isArray(list.data?.items)
      ? list.data.items.some(n => n?._id === noteId)
      : false;
    log('notes.list', list.status === 200 && seen, `status=${list.status}`);

    // Patch
    const patch = await j(`${API_BASE}/api/notes/${noteId}`, {
      method: 'PATCH',
      headers: H,
      body: JSON.stringify({ title: '__smoke_note__edited__' })
    });
    log('notes.patch', patch.status === 200, `status=${patch.status}`);

    // Delete
    const del = await j(`${API_BASE}/api/notes/${noteId}`, { method: 'DELETE', headers: H });
    log('notes.delete', del.status === 200, `status=${del.status}`);
  }

  // ---- SECTION-PAGES CRUD ----
  let pageId = null;
  {
    // Create
    const create = await j(`${API_BASE}/api/section-pages`, {
      method: 'POST',
      headers: H,
      body: JSON.stringify({
        sectionKey: '__smoke__',
        title: '__smoke_page__',
        body: 'hello from the smoke test',
      })
    });
    log('section-pages.create', create.status === 201, `status=${create.status}`);
    pageId = create.data?.item?._id;

    // List
    const list = await j(`${API_BASE}/api/section-pages`, { headers: H });
    const seen = Array.isArray(list.data?.items)
      ? list.data.items.some(p => p?._id === pageId)
      : false;
    log('section-pages.list', list.status === 200 && seen, `status=${list.status}`);

    // Patch
    const patch = await j(`${API_BASE}/api/section-pages/${pageId}`, {
      method: 'PATCH',
      headers: H,
      body: JSON.stringify({ title: '__smoke_page__edited__' })
    });
    log('section-pages.patch', patch.status === 200, `status=${patch.status}`);

    // Delete
    const del = await j(`${API_BASE}/api/section-pages/${pageId}`, { method: 'DELETE', headers: H });
    log('section-pages.delete', del.status === 200, `status=${del.status}`);
  }

  console.log('\n✨ CRUD smoke complete.');
})();
