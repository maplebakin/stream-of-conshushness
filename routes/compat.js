// routes/compat.js
import { Router } from 'express';
import auth from '../middleware/auth.js';
import Task from '../models/Task.js';
import Entry from '../models/Entry.js';

const r = Router();
r.use(auth);

/* ─── RIPPLES ────────────────────────────────────────────────────────── */

// Old FE: POST /api/ripples/approve  { id }
// Canonical: POST /api/ripples/:id/approve
r.post('/ripples/approve', (req, res) => {
  const id = String(req.body?.id || '').trim();
  if (!id) return res.status(400).json({ error: 'id required' });
  return res.redirect(307, `/api/ripples/${id}/approve`);
});

// Old FE: POST /api/ripples/dismiss  { id }
r.post('/ripples/dismiss', (req, res) => {
  const id = String(req.body?.id || '').trim();
  if (!id) return res.status(400).json({ error: 'id required' });
  return res.redirect(307, `/api/ripples/${id}/dismiss`);
});

// Old FE: GET /api/ripples/for-day?date=YYYY-MM-DD
// Canonical: GET /api/ripples?date=YYYY-MM-DD
r.get('/ripples/for-day', (req, res) => {
  const q = new URLSearchParams({ date: String(req.query?.date || '') }).toString();
  return res.redirect(307, `/api/ripples?${q}`);
});

// Old FE: GET /api/ripples/pending
// Canonical: GET /api/ripples?status=pending
r.get('/ripples/pending', (_req, res) => {
  return res.redirect(307, `/api/ripples?status=pending`);
});

// Old FE: POST /api/entries/:id/analyze
// Canonical: POST /api/ripples/analyze  { entryId, ... }
// We proxy by injecting entryId into the body and replaying the request.
r.post('/entries/:id/analyze', expressJsonReplay((req) => ({
  url: '/api/ripples/analyze',
  body: { ...req.body, entryId: req.params.id },
})));

/* ─── TASKS ──────────────────────────────────────────────────────────── */

// Old FE: POST /api/tasks/:id/complete  (idempotent set done=true)
r.post('/tasks/:id/complete', async (req, res) => {
  const userId = req.user.userId;
  const id = req.params.id;
  const t = await Task.findOne({ _id: id, userId });
  if (!t) return res.status(404).json({ error: 'task not found' });
  if (!t.done) {
    t.done = true;
    await t.save();
  }
  res.json({ ok: true, task: { id: t._id, done: t.done } });
});

// Old FE: POST /api/tasks/carry-forward  { from, to, cluster? }
r.post('/tasks/carry-forward', async (req, res) => {
  const userId = req.user.userId;
  const from = String(req.body?.from || '').trim();
  const to   = String(req.body?.to || '').trim();
  const cluster = req.body?.cluster ? String(req.body.cluster) : null;
  if (!from || !to) return res.status(400).json({ error: 'from and to required' });

  const match = { userId, done: false, dueDate: from };
  if (cluster) match.cluster = cluster;

  const result = await Task.updateMany(match, { $set: { dueDate: to } });
  res.json({ moved: result.modifiedCount || 0, to });
});

// Old FE: POST /api/tasks/from-entry { entryId, text?, title?, dueDate? }
r.post('/tasks/from-entry', async (req, res) => {
  const userId = req.user.userId;
  const { entryId, text = '', title = '', dueDate = null, cluster = null } = req.body || {};
  if (!entryId) return res.status(400).json({ error: 'entryId required' });

  const base = {};
  try {
    const e = await Entry.findOne({ _id: entryId, userId });
    if (e) {
      base.text = text || e.text || e.content || '';
      base.title = title || e.title || '';
    }
  } catch { /* non-fatal */ }

  const doc = await Task.create({
    userId,
    title: (title || base.title || '').slice(0, 200) || 'Task',
    text: (text || base.text || '').slice(0, 5000),
    dueDate: dueDate || null,
    cluster: cluster || null,
    done: false,
  });
  res.status(201).json({ id: doc._id, ok: true });
});

/* ─── SCHEDULE ───────────────────────────────────────────────────────── */

// Old FE: GET /api/schedule/:date   → canonical: GET /api/schedule?date=:date
r.get('/schedule/:date', (req, res) => {
  const q = new URLSearchParams({ date: req.params.date }).toString();
  return res.redirect(307, `/api/schedule?${q}`);
});

/* ─── CALENDAR ───────────────────────────────────────────────────────── */

// Some old calls may hit /api/calendar/* patterns that expect redirect.
r.get('/calendar/upcoming/list', (req, res) => {
  const q = new URLSearchParams({ from: String(req.query?.from || '') }).toString();
  return res.redirect(307, `/api/calendar/upcoming/list?${q}`);
});

/* ─── helpers ────────────────────────────────────────────────────────── */
/** Build a handler that replays a JSON POST to a new URL with a transformed body. */
function expressJsonReplay(mapper) {
  return async (req, res, next) => {
    try {
      // Capture original JSON body (already parsed by global express.json)
      const mapped = mapper(req);
      // Re-emit through Express by calling next route stack with modified req
      req.url = mapped.url;
      req.originalUrl = mapped.url;
      req.body = mapped.body;
      return next(); // falls through to the canonical route mounted later
    } catch (e) {
      return res.status(500).json({ error: 'compat replay failed' });
    }
  };
}
// Auth legacy shortcuts
r.post('/login',  expressJsonReplay(() => ({ url: '/api/auth/login',  body: {} })));
r.post('/register', expressJsonReplay(() => ({ url: '/api/auth/register', body: {} })));
r.post('/forgot', expressJsonReplay(() => ({ url: '/api/auth/forgot', body: {} })));
r.post('/reset',  expressJsonReplay(() => ({ url: '/api/auth/reset',  body: {} })));
r.get('/change-password',  (req,res)=>res.status(405).json({error:'use POST /api/auth/change-password'}));
r.post('/change-password', expressJsonReplay(() => ({ url: '/api/auth/change-password', body: {} })));

// Cluster singular → plural
r.get('/cluster', expressJsonReplay(() => ({ url: '/api/clusters', body: {} })));

export default r;
