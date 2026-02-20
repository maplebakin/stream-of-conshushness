// scripts/mvp_smoke.mjs
// Lightweight MVP smoke test for core daily loop.
// Usage: API_BASE=http://127.0.0.1:3000 node scripts/mvp_smoke.mjs

const API_BASE = process.env.API_BASE || 'http://127.0.0.1:3000';

async function req(path, { method = 'GET', token, body } = {}) {
  const r = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await r.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  return { status: r.status, data };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

(async () => {
  try {
    const email = `mvp_smoke_${Date.now()}@example.com`;
    const password = 'SmokePass123!';

    // 1) register + login
    const reg = await req('/api/register', {
      method: 'POST',
      body: { email, password },
    });
    assert([200, 201, 409].includes(reg.status), `register failed: ${reg.status}`);

    const login = await req('/api/login', {
      method: 'POST',
      body: { email, password },
    });
    assert(login.status === 200 && login.data?.token, `login failed: ${login.status}`);
    const token = login.data.token;

    // 2) create entry for today-ish fixed date
    const date = '2026-02-20';
    const entry = await req('/api/entries', {
      method: 'POST',
      token,
      body: { date, text: 'MVP smoke entry' },
    });
    assert([200, 201].includes(entry.status), `entry create failed: ${entry.status}`);
    const entryId = entry.data?._id || entry.data?.id;
    assert(entryId, 'entry id missing');

    // 3) create task from entry
    const fromEntry = await req('/api/tasks/from-entry', {
      method: 'POST',
      token,
      body: { entryId, title: 'Smoke task from entry' },
    });
    assert(fromEntry.status === 201, `from-entry failed: ${fromEntry.status}`);
    const taskId = fromEntry.data?.task?._id;
    assert(taskId, 'task id missing from from-entry');

    // 4) carry forward task
    const carry = await req('/api/tasks/carry-forward', {
      method: 'POST',
      token,
      body: { from: date, to: '2026-02-21' },
    });
    assert(carry.status === 200, `carry-forward failed: ${carry.status}`);

    // 5) link task back to entry date
    const link = await req(`/api/tasks/${taskId}/link-entry`, {
      method: 'POST',
      token,
      body: { date, autoCreate: true, title: `Journal for ${date}` },
    });
    assert(link.status === 200, `link-entry failed: ${link.status}`);

    // 6) fetch task views
    const inboxCount = await req('/api/tasks?view=inbox&countOnly=1', { token });
    assert(inboxCount.status === 200, `inbox count failed: ${inboxCount.status}`);

    const today = await req('/api/tasks?view=today&date=2026-02-21&includeOverdue=1', { token });
    assert(today.status === 200 && Array.isArray(today.data), `today list failed: ${today.status}`);

    console.log('✅ MVP smoke passed');
    console.log(JSON.stringify({
      register: reg.status,
      login: login.status,
      entry: entry.status,
      fromEntry: fromEntry.status,
      carryForward: carry.status,
      linkEntry: link.status,
      inboxCount: inboxCount.status,
      today: today.status,
    }, null, 2));
  } catch (e) {
    console.error('❌ MVP smoke failed:', e.message);
    process.exit(1);
  }
})();
