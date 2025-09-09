// routes/compat.js
import express, { Router } from 'express';
import auth from '../middleware/auth.js';
import Task from '../models/Task.js';
import Entry from '../models/Entry.js';
import Note from '../models/Note.js';

const r = Router();

// parse JSON here too (even if app has it) so compat is self-contained
r.use(express.json({ limit: '2mb' }));
r.use(express.urlencoded({ extended: true }));
r.use(auth);

/* ───────────────── helpers ───────────────── */
const str = (v) => (v == null ? '' : String(v)).trim();

function ymdToronto(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date);
  const y = parts.find(p => p.type === 'year').value;
  const m = parts.find(p => p.type === 'month').value;
  const d = parts.find(p => p.type === 'day').value;
  return `${y}-${m}-${d}`;
}

// Add days anchored at NOON UTC to dodge TZ drift (so Toronto never rolls back)
function addDaysISO(iso, days) {
  const [y, m, d] = String(iso).split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1, 12)); // noon UTC
  dt.setUTCDate(dt.getUTCDate() + Number(days || 0));
  return ymdToronto(dt);
}

function expressJsonReplay(mapper) {
  return async (req, res, next) => {
    try {
      const mapped = mapper(req);
      req.url = mapped.url;
      req.originalUrl = mapped.url;
      req.body = mapped.body;
      return next();
    } catch (e) {
      console.error('[compat] replay error:', e);
      return res.status(500).json({ error: 'compat replay failed' });
    }
  };
}

/* ─── RIPPLES (legacy shims) ────────────────────────────────────────── */
r.post('/ripples/approve', (req, res) => {
  const id = str(req.body?.id);
  if (!id) return res.status(400).json({ error: 'id required' });
  return res.redirect(307, `/api/ripples/${id}/approve`);
});

r.post('/ripples/dismiss', (req, res) => {
  const id = str(req.body?.id);
  if (!id) return res.status(400).json({ error: 'id required' });
  return res.redirect(307, `/api/ripples/${id}/dismiss`);
});

r.get('/ripples/for-day', (req, res) => {
  const q = new URLSearchParams({ date: String(req.query?.date || '') }).toString();
  return res.redirect(307, `/api/ripples?${q}`);
});

r.get('/ripples/pending', (_req, res) => {
  return res.redirect(307, `/api/ripples?status=pending`);
});

r.post('/entries/:id/analyze', expressJsonReplay((req) => ({
  url: '/api/ripples/analyze',
  body: { ...req.body, entryId: req.params.id },
})));

/* ─── TASKS (legacy) ────────────────────────────────────────────────── */

// POST /api/tasks/:id/complete  → idempotent completed=true
r.post('/tasks/:id/complete', async (req, res) => {
  try {
    const userId = req.user.userId;
    const id = req.params.id;
    const t = await Task.findOne({ _id: id, userId });
    if (!t) return res.status(404).json({ error: 'task not found' });
    if (!t.completed) { t.completed = true; await t.save(); }
    return res.json({ ok: true, task: { id: t._id, completed: t.completed } });
  } catch (e) {
    console.error('[compat] complete failed:', e);
    return res.status(500).json({ error: 'complete failed' });
  }
});

// POST /api/tasks/carry-forward  { from, to, cluster? }
// If FE sends nothing, default to today→tomorrow (America/Toronto).
r.post('/tasks/carry-forward', async (req, res) => {
  try {
    const userId = req.user.userId;

    const str = (v) => (v == null ? '' : String(v)).trim();
    const ymdToronto = (date = new Date()) => {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Toronto',
        year: 'numeric', month: '2-digit', day: '2-digit'
      }).formatToParts(date);
      const y = parts.find(p => p.type === 'year').value;
      const m = parts.find(p => p.type === 'month').value;
      const d = parts.find(p => p.type === 'day').value;
      return `${y}-${m}-${d}`;
    };
    const addDaysISO = (iso, days) => {
      const [y,m,d] = String(iso).split('-').map(Number);
      const dt = new Date(Date.UTC(y, (m||1)-1, d||1, 12)); // noon UTC to avoid TZ drift
      dt.setUTCDate(dt.getUTCDate() + Number(days || 0));
      return ymdToronto(dt);
    };

    let from = str(req.body?.from) || str(req.query?.from);
    let to   = str(req.body?.to)   || str(req.query?.to);
    const cluster = str(req.body?.cluster) || str(req.query?.cluster);

    if (!from && !to) { from = ymdToronto(); to = addDaysISO(from, 1); }
    else if (from && !to) { to = addDaysISO(from, 1); }
    else if (!from && to) { from = ymdToronto(); }

    if (!from || !to) {
      return res.status(400).json({ error: 'from and to required', got: { from, to } });
    }

    const match = { userId, completed: false, dueDate: from };
    if (cluster) match.clusters = cluster; // matches array containing value

    const result = await Task.updateMany(match, { $set: { dueDate: to } });
    return res.json({ moved: result.modifiedCount || 0, from, to, cluster: cluster || null });
  } catch (e) {
    console.error('[compat] carry-forward failed:', e);
    return res.status(500).json({ error: 'carry-forward failed' });
  }
});


// POST /api/tasks/from-entry { entryId, title?, text?, dueDate?, cluster? }
r.post('/tasks/from-entry', async (req, res) => {
  try {
    const userId = req.user.userId;
    const { entryId, title = '', text = '', dueDate = null, cluster = '' } = req.body || {};
    if (!entryId) return res.status(400).json({ error: 'entryId required' });

    let base = { title: '', text: '' };
    try {
      const e = await Entry.findOne({ _id: entryId, userId });
      if (e) { base.text = text || e.text || e.content || ''; base.title = title || e.title || ''; }
    } catch { /* ignore */ }

    const created = await Task.create({
      userId,
      title: (title || base.title || '').slice(0, 200) || 'Task',
      notes: (text || base.text || '').slice(0, 5000),
      dueDate: dueDate || null,
      clusters: cluster ? [cluster] : [],
      sections: [],
      rrule: '',
      completed: false,
      entryId,
    });

    return res.status(201).json({ ok: true, task: created });
  } catch (e) {
    console.error('[compat] from-entry failed:', e);
    return res.status(500).json({ error: 'from-entry failed' });
  }
});

/* ─── NOTES (singular compat handled here to avoid FE 404/400) ───────── */

// GET /api/note/:date → return 200 and null payload if missing
r.get('/note/:date', async (req, res) => {
  try {
    const userId = req.user.userId;
    const date = req.params.date;
    const item = await Note.findOne({ userId, date }).lean();
    return res.json({ ok: true, item: item || null, content: item?.content || '' });
  } catch (e) {
    console.error('[compat] note get failed:', e);
    return res.status(500).json({ error: 'note get failed' });
  }
});

// Also allow /api/note?date=YYYY-MM-DD
r.get('/note', async (req, res) => {
  try {
    const userId = req.user.userId;
    const date = str(req.query?.date);
    if (!date) return res.json({ ok: true, item: null, content: '' });
    const item = await Note.findOne({ userId, date }).lean();
    return res.json({ ok: true, item: item || null, content: item?.content || '' });
  } catch (e) {
    console.error('[compat] note get failed:', e);
    return res.status(500).json({ error: 'note get failed' });
  }
});

/* ─── SCHEDULE / CALENDAR redirects ─────────────────────────────────── */
r.get('/schedule/:date', (req, res) => {
  const q = new URLSearchParams({ date: req.params.date }).toString();
  return res.redirect(307, `/api/schedule?${q}`);
});

r.get('/calendar/upcoming/list', (req, res) => {
  const q = new URLSearchParams({ from: String(req.query?.from || '') }).toString();
  return res.redirect(307, `/api/calendar/upcoming/list?${q}`);
});

/* ─── AUTH legacy passthroughs ──────────────────────────────────────── */
r.post('/login',        expressJsonReplay(() => ({ url: '/api/auth/login',           body: {} })));
r.post('/register',     expressJsonReplay(() => ({ url: '/api/auth/register',        body: {} })));
r.post('/forgot',       expressJsonReplay(() => ({ url: '/api/auth/forgot',          body: {} })));
r.post('/reset',        expressJsonReplay(() => ({ url: '/api/auth/reset',           body: {} })));
r.get('/change-password',  (_req,res)=>res.status(405).json({error:'use POST /api/auth/change-password'}));
r.post('/change-password', expressJsonReplay(() => ({ url: '/api/auth/change-password', body: {} })));

export default r;
