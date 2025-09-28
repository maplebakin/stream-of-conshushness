// server/routes/tasks.js
import express from 'express';
import Task from '../models/Task.js';

const router = express.Router();

/* ---------------------- helpers ---------------------- */
function getUserId(req) {
  return req.user?.userId || req.user?._id || req.user?.id || null;
}

function parseBool(v, def = false) {
  if (v == null) return def;
  const s = String(v).toLowerCase();
  return s === '1' || s === 'true' || s === 'yes';
}
function clamp(n, lo, hi) {
  const x = parseInt(n, 10);
  if (Number.isNaN(x)) return lo;
  return Math.max(lo, Math.min(hi, x));
}

/* Core lister wrapped so it never explodes */
async function listTasksCore(req, res) {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const {
      date,            // alias of dueDate
      dueDate,
      cluster,         // single cluster key (string)
      includeCompleted,
      completed,       // explicit completed=true/false overrides includeCompleted
      limit,
      offset,
      section,
    } = req.query;

    const q = { userId };

    const dayISO = dueDate || date;
    if (dayISO) q.dueDate = dayISO;

    if (cluster) q.clusters = String(cluster);
    if (section) q.sections = String(section);

    if (completed !== undefined) {
      q.completed = parseBool(completed);
    } else if (!parseBool(includeCompleted, false)) {
      q.completed = false;
    }

    const lim = clamp(limit ?? 200, 1, 1000);
    const off = clamp(offset ?? 0, 0, 1_000_000);

    const sort = { completed: 1, dueDate: 1, createdAt: -1 };
    const items = await Task.find(q).sort(sort).skip(off).limit(lim).lean();
    res.json(items);
  } catch (e) {
    console.error('[tasks] list failed:', e);
    res.status(500).json({ error: 'list failed' });
  }
}

/* ---------------------- routes ---------------------- */

// GET /api/tasks
router.get('/', listTasksCore);

// Alias: GET /api/tasks/day/:date  (includes completed by default)
router.get('/day/:date', async (req, res) => {
  try {
    req.query.dueDate = req.params.date;
    if (req.query.includeCompleted == null) req.query.includeCompleted = '1';
    return listTasksCore(req, res);
  } catch (e) {
    console.error('[tasks] day list failed:', e);
    res.status(500).json({ error: 'list failed' });
  }
});

// PATCH/PUT /api/tasks/:id
async function updateTask(req, res) {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const { id } = req.params;
    const up = {};
    for (const k of ['title','notes','dueDate','completed','priority','clusters','sections','rrule','status']) {
      if (req.body[k] !== undefined) up[k] = req.body[k];
    }
    if (typeof up.title === 'string') {
      up.title = up.title.trim();
      if (!up.title) return res.status(400).json({ error: 'title required' });
    }
    const doc = await Task.findOne({ _id: id, userId });
    if (!doc) return res.status(404).json({ error: 'Not found' });

    if (up.title !== undefined) doc.title = up.title;
    if (up.notes !== undefined) doc.notes = typeof up.notes === 'string' ? up.notes : '';
    if (up.dueDate !== undefined) doc.dueDate = up.dueDate || null;
    if (up.priority !== undefined) doc.priority = Number.isFinite(Number(up.priority)) ? Number(up.priority) : 0;
    if (up.clusters !== undefined) doc.clusters = Array.isArray(up.clusters) ? up.clusters : [];
    if (up.sections !== undefined) doc.sections = Array.isArray(up.sections) ? up.sections : [];
    if (up.rrule !== undefined) doc.rrule = typeof up.rrule === 'string' ? up.rrule : '';
    if (up.completed !== undefined) doc.completed = !!up.completed;
    if (up.status !== undefined) {
      const allowed = ['todo', 'doing', 'done'];
      if (allowed.includes(String(up.status))) {
        doc.status = String(up.status);
      }
    }

    const saved = await doc.save();
    res.json(saved);
  } catch (e) {
    console.error('[tasks] update failed:', e);
    res.status(500).json({ error: 'update failed' });
  }
}
router.patch('/:id', updateTask);
router.put('/:id', updateTask);

// Toggle + spawn next if recurring (validation-safe)
router.patch('/:id/toggle', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const { id } = req.params;

    // Load minimal fields we need for recurrence, but don't save this doc.
    const task = await Task.findOne(
      { _id: id, userId },
      'completed title notes dueDate priority clusters sections rrule'
    ).lean();
    if (!task) return res.status(404).json({ error: 'Not found' });

    const nowCompleted = !task.completed;

    // Atomic flip WITHOUT running model validation on unrelated fields
    const status = nowCompleted ? 'done' : (task.status === 'done' ? 'todo' : task.status || 'todo');
    const completedAt = nowCompleted ? new Date() : null;
    const updated = await Task.findOneAndUpdate(
      { _id: id, userId },
      { $set: { completed: nowCompleted, status, completedAt } },
      { new: true, runValidators: true }
    ).lean();

    // If we just completed and it's recurring, spawn the next
    let next = null;
    if (nowCompleted && task.rrule && task.dueDate) {
      const nextDue = nextFromRRule(task.rrule, task.dueDate);
      if (nextDue) {
        const safeTitle = (typeof task.title === 'string' && task.title.trim()) ? task.title.trim() : '(untitled)';
        const safePriority = Number.isFinite(Number(task.priority)) ? Number(task.priority) : 0;
        next = await Task.create({
          userId,
          title: safeTitle,
          notes: task.notes || '',
          dueDate: nextDue,
          priority: safePriority,
          clusters: Array.isArray(task.clusters) ? task.clusters : [],
          sections: Array.isArray(task.sections) ? task.sections : [],
          rrule: task.rrule,
          completed: false,
          status: 'todo',
        });
      }
    }

    return res.json({ task: updated, next });
  } catch (e) {
    console.error('[tasks] toggle failed:', e);
    return res.status(500).json({ error: 'toggle failed' });
  }
});

// POST /api/tasks (create)
router.post('/', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    let { title, notes, dueDate, priority = 0, clusters = [], sections = [], rrule = '', status = 'todo' } = req.body || {};
    title = typeof title === 'string' ? title.trim() : '';
    if (!title) return res.status(400).json({ error: 'title required' });

    const allowedStatuses = ['todo', 'doing', 'done'];
    const safeStatus = allowedStatuses.includes(status) ? status : 'todo';

    const doc = await Task.create({
      userId,
      title,
      notes: notes || '',
      dueDate,
      priority,
      clusters: clusters || [],
      sections: sections || [],
      rrule,
      completed: false,
      status: safeStatus === 'done' ? 'done' : safeStatus,
    });
    res.status(201).json(doc);
  } catch (e) {
    // validation stays 400; everything else 500
    const code = e?.name === 'ValidationError' ? 400 : 500;
    console.error('[tasks] create failed:', e);
    res.status(code).json({ error: e?.message || 'create failed' });
  }
});

// DELETE /api/tasks/:id  → hard delete a single task
router.delete('/:id', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const { id } = req.params;
    const doc = await Task.findOneAndDelete({ _id: id, userId });
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true, deleted: doc._id });
  } catch (e) {
    console.error('[tasks] delete failed:', e);
    res.status(500).json({ error: 'delete failed' });
  }
});

// POST /api/tasks/bulk-delete  → hard delete many by id
router.post('/bulk-delete', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter(Boolean) : [];
    if (ids.length === 0) return res.status(400).json({ error: 'ids required' });
    const r = await Task.deleteMany({ _id: { $in: ids }, userId });
    res.json({ ok: true, deletedCount: r.deletedCount });
  } catch (e) {
    console.error('[tasks] bulk-delete failed:', e);
    res.status(500).json({ error: 'bulk-delete failed' });
  }
});


/* -------- minimal recurrence helpers (daily/weekly/monthly) -------- */
function addDaysISO(iso, n) {
  const [Y, M, D] = iso.split('-').map(Number);
  const d = new Date(Date.UTC(Y, M - 1, D));
  d.setUTCDate(d.getUTCDate() + n);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
const DOW = { SU:0, MO:1, TU:2, WE:3, TH:4, FR:5, SA:6 };
function nextWeekdayFrom(iso, targetDow) {
  const d = new Date(`${iso}T12:00:00Z`);
  const cur = d.getUTCDay();
  let delta = (targetDow - cur + 7) % 7;
  if (delta === 0) delta = 7;
  d.setUTCDate(d.getUTCDate() + delta);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function nextFromRRule(rrule, fromISO) {
  if (!rrule || !fromISO) return '';
  const parts = Object.fromEntries(rrule.split(';').map(s => s.split('=')));
  const FREQ = parts.FREQ;
  const INTERVAL = Math.max(1, parseInt(parts.INTERVAL || '1', 10));
  if (FREQ === 'DAILY') return addDaysISO(fromISO, INTERVAL);
  if (FREQ === 'WEEKLY') {
    const by = (parts.BYDAY || '').split(',').filter(Boolean);
    if (by.length === 0) return addDaysISO(fromISO, 7 * INTERVAL);
    const options = by.map(code => nextWeekdayFrom(fromISO, DOW[code]));
    options.sort();
    return options[0];
  }
  if (FREQ === 'MONTHLY') {
    // naive: next month same day
    const [Y, M, D] = fromISO.split('-').map(Number);
    const d = new Date(Date.UTC(Y, M - 1 + INTERVAL, D));
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  return '';
}

export default router;
