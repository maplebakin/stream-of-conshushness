// routes/compat.js
import express, { Router } from 'express';
import mongoose from 'mongoose';
import auth from '../middleware/auth.js';
import Task from '../models/Task.js';
import Note from '../models/Note.js';
import { torontoYmd, addDaysISO } from '../utils/date.js';
import { logSafeError } from '../utils/errorHandler.js';
import { setTaskCompletionForOwner } from './tasks.js';

const r = Router();

// parse JSON here too (even if app has it) so compat is self-contained
r.use(express.json({ limit: '2mb' }));
r.use(express.urlencoded({ extended: true }));

/* ───────────────── helpers ───────────────── */
const str = (v) => (v == null ? '' : String(v)).trim();

function expressJsonReplay(mapper) {
  return async (req, res, next) => {
    try {
      const mapped = mapper(req);
      req.url = mapped.url;
      req.originalUrl = mapped.url;
      req.body = mapped.body;
      return next();
    } catch (e) {
      logSafeError('compat replay failed', e);
      return res.status(500).json({ error: 'compat replay failed' });
    }
  };
}

// Authentication entry points must remain public just like their canonical
// `/api/auth/*` counterparts. Keep these shims before the owner-scoped auth
// gate so older clients can actually sign in or recover an account.
r.post('/login',        (_req, res) => res.redirect(307, '/api/auth/login'));
r.post('/register',     (_req, res) => res.redirect(307, '/api/auth/register'));
r.post('/forgot',       (_req, res) => res.redirect(307, '/api/auth/forgot'));
r.post('/reset',        (_req, res) => res.redirect(307, '/api/auth/reset'));

r.use(auth);

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
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid id' });
    }
    const result = await setTaskCompletionForOwner({ userId, taskId: id, completed: true });
    if (result.outcome === 'not-found') return res.status(404).json({ error: 'task not found' });
    if (result.outcome === 'conflict') {
      return res.status(409).json({ error: 'Task changed; refresh and try again' });
    }
    return res.json({
      ok: true,
      task: { id: result.task._id, completed: result.task.completed },
      next: result.next || null,
    });
  } catch (e) {
    logSafeError('compat complete failed', e);
    return res.status(500).json({ error: 'complete failed' });
  }
});

// POST /api/tasks/carry-forward  { from, to, cluster? }
// If FE sends nothing, default to today→tomorrow (America/Toronto).
r.post('/tasks/carry-forward', async (req, res) => {
  try {
    const userId = req.user.userId;

    let from = str(req.body?.from) || str(req.query?.from);
    let to   = str(req.body?.to)   || str(req.query?.to);
    const cluster = str(req.body?.cluster) || str(req.query?.cluster);

    if (!from && !to) { from = torontoYmd(); to = addDaysISO(from, 1); }
    else if (from && !to) { to = addDaysISO(from, 1); }
    else if (!from && to) { from = torontoYmd(); }

    if (!from || !to) {
      return res.status(400).json({ error: 'from and to required', got: { from, to } });
    }

    const match = { userId, completed: false, dueDate: from };
    if (cluster) match.clusters = cluster; // matches array containing value

    const result = await Task.updateMany(match, { $set: { dueDate: to } });
    return res.json({ moved: result.modifiedCount || 0, from, to, cluster: cluster || null });
  } catch (e) {
    logSafeError('compat carry forward failed', e);
    return res.status(500).json({ error: 'carry-forward failed' });
  }
});


// Preserve the legacy URL, but let the canonical route perform entry and
// cluster ownership validation. A 307 keeps the original POST body intact.
r.post('/tasks/from-entry', (_req, res) => {
  return res.redirect(307, '/api/tasks/from-entry');
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
    logSafeError('compat note get failed', e);
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
    logSafeError('compat note get failed', e);
    return res.status(500).json({ error: 'note get failed' });
  }
});

/* ─── SCHEDULE / CALENDAR redirects ─────────────────────────────────── */
r.get('/schedule/:date', (req, res) => {
  const { date } = req.params;
  return res.redirect(307, `/api/schedule/${encodeURIComponent(date)}`);
});

r.get('/calendar/upcoming/list', (req, res) => {
  const q = new URLSearchParams({ from: String(req.query?.from || '') }).toString();
  return res.redirect(307, `/api/calendar/upcoming/list?${q}`);
});

/* ─── AUTH legacy passthroughs ──────────────────────────────────────── */
r.get('/change-password',  (_req,res)=>res.status(405).json({error:'use POST /api/auth/change-password'}));
r.post('/change-password', expressJsonReplay((req) => ({ url: '/api/auth/change-password', body: req.body })));

export default r;
