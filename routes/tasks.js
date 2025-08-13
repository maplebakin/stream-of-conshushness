// routes/tasks.js
import express from 'express';
import Task from '../models/Task.js';
import auth from '../middleware/auth.js';

const router = express.Router();
router.use(auth);

/** Normalize user id across JWT shapes */
function getUserId(req) {
  return req.user?.userId || req.user?._id || req.user?.id;
}

/** YYYY-MM-DD in America/Toronto */
function todayISOInToronto() {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric', month: '2-digit', day: '2-digit'
  });
  const p = fmt.formatToParts(new Date());
  const y = p.find(x => x.type === 'year').value;
  const m = p.find(x => x.type === 'month').value;
  const d = p.find(x => x.type === 'day').value;
  return `${y}-${m}-${d}`;
}

/** Parse ISO to Date (local midnight) */
function parseISO(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

/** Add days, return ISO local */
function addDaysISO(iso, n) {
  const dt = parseISO(iso);
  dt.setDate(dt.getDate() + n);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Clamp day-of-month (e.g., Feb 31 → Feb 28/29) */
function addMonthsClampISO(iso, n) {
  const [y, m, d] = String(iso).split('-').map(Number);
  const base = new Date(y, (m - 1) + n, 1);
  const targetDay = Math.min(
    d || 1,
    new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate()
  );
  base.setDate(targetDay);
  const yy = base.getFullYear();
  const mm = String(base.getMonth() + 1).padStart(2, '0');
  const dd = String(base.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/** Map MO..SU -> 0..6 (Sun=0) */
const DOW = { SU:0, MO:1, TU:2, WE:3, TH:4, FR:5, SA:6 };

/** Compute next due date for a repeating task */
function nextDueDate({ currentDue, repeat, fromDateISO }) {
  if (!repeat) return null;
  const unit = repeat.unit || String(repeat).toLowerCase(); // allow legacy strings like "daily"
  const interval = Number(repeat.interval || 1);

  // Anchor: if currentDue exists, use that; else use fromDate (today).
  const anchor = currentDue || fromDateISO || todayISOInToronto();

  if (unit === 'day' || /daily/.test(unit)) {
    return addDaysISO(fromDateISO || anchor, Math.max(1, interval));
  }

  if (unit === 'week' || /weekly/.test(unit)) {
    const from = parseISO(fromDateISO || anchor);
    const by = Array.isArray(repeat.byDay) ? repeat.byDay : [];

    // If specific weekdays provided (e.g., ['MO','TH']), find the next one strictly after 'from'
    if (by.length) {
      const wanted = by
        .map(s => DOW[(s || '').toUpperCase()])
        .filter(v => v !== undefined);

      for (let i = 1; i <= 21; i++) {
        const cand = new Date(from);
        cand.setDate(cand.getDate() + i);
        const dow = cand.getDay();
        if (wanted.includes(dow)) {
          // (Basic) interval handling: if interval>1, only accept every Nth week from anchor week
          if (interval > 1) {
            const weeksFromAnchor = Math.floor(i / 7);
            if (weeksFromAnchor % interval !== 0) continue;
          }
          const yy = cand.getFullYear();
          const mm = String(cand.getMonth() + 1).padStart(2, '0');
          const dd = String(cand.getDate()).padStart(2, '0');
          return `${yy}-${mm}-${dd}`;
        }
      }
      // fallback: just +interval weeks
      return addDaysISO(fromDateISO || anchor, 7 * Math.max(1, interval));
    }

    // No specific weekday → bump by N weeks
    return addDaysISO(fromDateISO || anchor, 7 * Math.max(1, interval));
  }

  if (unit === 'month' || /monthly/.test(unit)) {
    return addMonthsClampISO(fromDateISO || anchor, Math.max(1, interval));
  }

  // Unknown format → default to +1 day
  return addDaysISO(fromDateISO || anchor, 1);
}

/** Base query from req */
function baseQuery(req) {
  const userId = getUserId(req);
  const q = { userId };
  const { cluster, completed } = req.query;

  if (cluster) q.cluster = cluster;
  if (completed === 'true') q.completed = true;
  if (completed === 'false') q.completed = false;

  return q;
}

/** Sort: due soon first; undated last */
const defaultSort = { completed: 1, dueDate: 1, createdAt: 1 };

/**
 * GET /api/tasks
 *   view=today|inbox|overdue|date|all  (default today)
 *   date=YYYY-MM-DD (default Toronto today)
 *   includeOverdue=0|1 (default 1 when view=today)
 *   countOnly=0|1
 *   cluster, completed
 *
 * Recurring tasks show ONLY when due (or overdue), not every day.
 */
router.get('/', async (req, res) => {
  const view = (req.query.view || 'today').toLowerCase();
  const date = req.query.date || todayISOInToronto();
  const includeOverdue = req.query.includeOverdue !== '0';
  const countOnly = req.query.countOnly === '1';

  const q = baseQuery(req);

  if (view === 'today') {
    q.completed ??= false;
    q.$or = [{ dueDate: date }];
    if (includeOverdue) q.$or.push({ dueDate: { $lt: date } });
  } else if (view === 'inbox') {
    q.completed ??= false;
    q.$or = [{ dueDate: { $exists: false } }, { dueDate: null }, { dueDate: '' }];
  } else if (view === 'overdue') {
    q.completed ??= false;
    q.dueDate = { $lt: date };
  } else if (view === 'date') {
    q.dueDate = date;
  } else if (view === 'all') {
    // no extra filters
  } else {
    return res.status(400).json({ error: 'Invalid view' });
  }

  if (countOnly) {
    const count = await Task.countDocuments(q);
    return res.json({ count });
  }

  const tasks = await Task.find(q).sort(defaultSort);
  res.json(tasks);
});
/**
 * GET /api/tasks/counts/inbox-by-cluster
 * Returns counts of undated, incomplete tasks grouped by cluster name.
 * Works with both legacy `cluster` (string) and modern `clusters` (array).
 * Response: [{ cluster: 'Arts & Crafts', count: 3 }, ...]
 */
router.get('/counts/inbox-by-cluster', async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?._id || req.user?.id;
    const match = {
      userId: new mongoose.Types.ObjectId(userId),
      completed: false,
      $or: [{ dueDate: { $exists: false } }, { dueDate: null }, { dueDate: '' }]
    };

    const pipeline = [
      { $match: match },
      // normalize to an array field
      { $addFields: {
          clustersComputed: {
            $cond: [
              { $gt: [{ $size: { $ifNull: ['$clusters', []] } }, 0] },
              '$clusters',
              { $cond: [
                { $and: [ { $ne: ['$cluster', null] }, { $ne: ['$cluster', '' ] } ] },
                ['$cluster'],
                ['Unassigned']
              ] }
            ]
          }
      }},
      { $unwind: '$clustersComputed' },
      { $group: { _id: '$clustersComputed', count: { $sum: 1 } } },
      { $project: { _id: 0, cluster: '$_id', count: 1 } },
      { $sort: { cluster: 1 } }
    ];

    const out = await Task.aggregate(pipeline);
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: 'Failed to get inbox counts by cluster' });
  }
});

/** POST /api/tasks — create */
router.post('/', async (req, res) => {
  try {
    const {
      title,
      details = '',
      dueDate = null,
      cluster = '',
      clusters = [],
      repeat = null,
      entryId = null,
      goalId = null
    } = req.body;

    if (!title || !String(title).trim()) {
      return res.status(400).json({ error: 'Title is required' });
    }

    const task = await Task.create({
      userId: getUserId(req),
      title: String(title).trim(),
      details: String(details || ''),
      dueDate: dueDate || null,
      cluster,
      clusters: Array.isArray(clusters) ? clusters : [],
      repeat,
      entryId,
      goalId,
      completed: false
    });

    res.status(201).json(task);
  } catch (e) {
    res.status(500).json({ error: 'Failed to create task' });
  }
});

/** PATCH /api/tasks/:id — standard update */
router.patch('/:id', async (req, res) => {
  try {
    const update = {};
    [
      'title', 'details', 'dueDate', 'cluster', 'clusters',
      'repeat', 'completed', 'entryId', 'goalId'
    ].forEach((k) => {
      if (k in req.body) update[k] = req.body[k];
    });

    if (update.dueDate === '' || update.dueDate === undefined) delete update.dueDate;
    if (update.dueDate === null) update.dueDate = null;

    const task = await Task.findOneAndUpdate(
      { _id: req.params.id, userId: getUserId(req) },
      update,
      { new: true }
    );
    if (!task) return res.status(404).json({ error: 'Task not found' });
    res.json(task);
  } catch {
    res.status(500).json({ error: 'Failed to update task' });
  }
});

/**
 * POST /api/tasks/:id/complete
 * Completes a task. If the task has `repeat`, it ADVANCES to the next due date
 * and stays incomplete (rolling task pattern). Returns the updated (advanced) task.
 * Body: { fromDate?: 'YYYY-MM-DD' }  (defaults to today in Toronto)
 */
router.post('/:id/complete', async (req, res) => {
  try {
    const userId = getUserId(req);
    const id = req.params.id;
    const fromDate = req.body?.fromDate || todayISOInToronto();

    const task = await Task.findOne({ _id: id, userId });
    if (!task) return res.status(404).json({ error: 'Task not found' });

    if (task.repeat) {
      const next = nextDueDate({
        currentDue: task.dueDate,
        repeat: task.repeat,
        fromDateISO: fromDate
      });
      const updated = await Task.findOneAndUpdate(
        { _id: id, userId },
        { $set: { dueDate: next, completed: false } },
        { new: true }
      );
      return res.json(updated);
    }

    // Non-repeating: mark complete
    const updated = await Task.findOneAndUpdate(
      { _id: id, userId },
      { $set: { completed: true } },
      { new: true }
    );
    res.json(updated);
  } catch (e) {
    console.error('complete error', e);
    res.status(500).json({ error: 'Failed to complete task' });
  }
});

/**
 * POST /api/tasks/:id/skip
 * Advances a repeating task to its next scheduled date (keeps completed:false).
 * Body: { fromDate?: 'YYYY-MM-DD' }  (defaults to today in Toronto)
 */
router.post('/:id/skip', async (req, res) => {
  try {
    const userId = getUserId(req);
    const id = req.params.id;
    const fromDate = req.body?.fromDate || todayISOInToronto();

    const task = await Task.findOne({ _id: id, userId });
    if (!task) return res.status(404).json({ error: 'Task not found' });
    if (!task.repeat) return res.status(400).json({ error: 'Task is not repeating' });

    const next = nextDueDate({
      currentDue: task.dueDate,
      repeat: task.repeat,
      fromDateISO: fromDate
    });

    const updated = await Task.findOneAndUpdate(
      { _id: id, userId },
      { $set: { dueDate: next, completed: false } },
      { new: true }
    );
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: 'Failed to skip task occurrence' });
  }
});

/** DELETE /api/tasks/:id */
router.delete('/:id', async (req, res) => {
  try {
    const out = await Task.deleteOne({ _id: req.params.id, userId: getUserId(req) });
    if (out.deletedCount === 0) return res.status(404).json({ error: 'Task not found' });
    res.sendStatus(204);
  } catch {
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

/**
 * POST /api/tasks/carry-forward
 * Moves all incomplete overdue tasks (dueDate < today) to today.
 */
router.post('/carry-forward', async (req, res) => {
  try {
    const userId = getUserId(req);
    const today = todayISOInToronto();
    const criteria = { userId, completed: false, dueDate: { $lt: today } };

    const result = await Task.updateMany(criteria, { $set: { dueDate: today } });
    const moved = result.modifiedCount ?? result.nModified ?? 0;
    res.json({ moved, date: today });
  } catch (e) {
    res.status(500).json({ error: 'Failed to carry forward tasks' });
  }
});

export default router;
