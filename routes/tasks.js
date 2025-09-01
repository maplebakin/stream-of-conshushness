// server/routes/tasks.js
import express from 'express';
import authenticateToken from '../middleware/auth.js';
import Task from '../models/Task.js';

const router = express.Router();

/* ---------------------- helpers ---------------------- */
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
    const userId = req.user.userId;
    const {
      date,            // alias of dueDate
      dueDate,
      cluster,         // single cluster key (string)
      includeCompleted,
      completed,       // explicit completed=true/false overrides includeCompleted
      limit,
      offset,
    } = req.query;

    const q = { userId };

    const dayISO = dueDate || date;
    if (dayISO) q.dueDate = dayISO;

    if (cluster) q.clusters = cluster;

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
router.get('/', authenticateToken, listTasksCore);

// Alias: GET /api/tasks/day/:date  (includes completed by default)
router.get('/day/:date', authenticateToken, async (req, res) => {
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
    const userId = req.user.userId;
    const { id } = req.params;
    const up = {};
    for (const k of ['title','notes','dueDate','completed','priority','clusters','sections','rrule']) {
      if (req.body[k] !== undefined) up[k] = req.body[k];
    }
    if (typeof up.title === 'string') {
      up.title = up.title.trim();
      if (!up.title) return res.status(400).json({ error: 'title required' });
    }
    const doc = await Task.findOneAndUpdate({ _id: id, userId }, { $set: up }, { new: true });
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json(doc);
  } catch (e) {
    console.error('[tasks] update failed:', e);
    res.status(500).json({ error: 'update failed' });
  }
}
router.patch('/:id', authenticateToken, updateTask);
router.put('/:id', authenticateToken, updateTask);

// Toggle + spawn next if recurring (validation-safe)
router.patch('/:id/toggle', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;

    // Load minimal fields we need for recurrence, but don't save this doc.
    const task = await Task.findOne(
      { _id: id, userId },
      'completed title notes dueDate priority clusters sections rrule'
    ).lean();
    if (!task) return res.status(404).json({ error: 'Not found' });

    const nowCompleted = !task.completed;

    // Atomic flip WITHOUT running model validation on unrelated fields
    const updated = await Task.findOneAndUpdate(
      { _id: id, userId },
      { $set: { completed: nowCompleted } },
      { new: true, runValidators: false } // ← important
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
router.post('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    let { title, notes, dueDate, priority = 0, clusters = [], sections = [], rrule = '' } = req.body || {};
    title = typeof title === 'string' ? title.trim() : '';
    if (!title) return res.status(400).json({ error: 'title required' });

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
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
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
router.post('/bulk-delete', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
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
