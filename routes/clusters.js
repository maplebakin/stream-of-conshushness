// backend/routes/clusters.js
import express from 'express';
import auth from '../middleware/auth.js';
import Cluster, { slugifyKey } from '../models/Cluster.js';
import Task from '../models/Task.js';
import Entry from '../models/Entry.js';

const router = express.Router();
router.use(auth);

/* ── Toronto date helpers ───────────────────────────────── */
function todayISOInToronto(base = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit'
  });
  const parts = fmt.formatToParts(base);
  const y = parts.find(p => p.type === 'year')?.value;
  const m = parts.find(p => p.type === 'month')?.value;
  const d = parts.find(p => p.type === 'day')?.value;
  return `${y}-${m}-${d}`;
}
function isoMinusDays(iso, n) {
  const [Y,M,D] = String(iso).split('-').map(x => parseInt(x,10));
  const dt = new Date(Date.UTC(Y, M-1, D, 12, 0, 0));
  dt.setUTCDate(dt.getUTCDate() - n);
  return todayISOInToronto(dt);
}

/* ── CRUD ───────────────────────────────────────────────── */

router.get('/', async (req, res) => {
  try {
    const rows = await Cluster.find({ userId: req.user.id })
      .sort({ pinned: -1, order: 1, createdAt: 1 })
      .lean();
    res.json({ data: rows });
  } catch (e) {
    res.status(500).json({ error: 'Failed to list clusters' });
  }
});

router.get('/exists', async (req, res) => {
  try {
    const key = slugifyKey(req.query.key || '');
    if (!key) return res.json({ exists: false });
    const found = await Cluster.findOne({ userId: req.user.id, key })
      .collation({ locale: 'en', strength: 2 })
      .lean();
    res.json({ exists: !!found });
  } catch {
    res.json({ exists: false });
  }
});

router.post('/', async (req, res) => {
  try {
    const key   = slugifyKey(req.body?.key || req.body?.label || '');
    const label = String(req.body?.label || '').trim();
    if (!key || !label) return res.status(400).json({ error: 'key and label are required' });

    const exists = await Cluster.findOne({ userId: req.user.id, key })
      .collation({ locale: 'en', strength: 2 })
      .lean();
    if (exists) return res.status(409).json({ error: 'Cluster key already exists' });

    const doc = await Cluster.create({
      userId: req.user.id,
      key,
      label,
      color: req.body?.color || '#9b87f5',
      icon:  req.body?.icon || '🗂️',
      description: req.body?.description || '',
      pinned: !!req.body?.pinned,
      order: Number.isFinite(req.body?.order) ? req.body.order : 0,
    });

    res.status(201).json({ data: doc });
  } catch (e) {
    if (e?.code === 11000) return res.status(409).json({ error: 'Cluster key already exists' });
    console.error('Create cluster error:', e);
    res.status(500).json({ error: 'Failed to create cluster' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const updates = {};
    if ('key' in req.body) updates.key = slugifyKey(req.body.key);
    ['label','color','icon','description','pinned','order'].forEach(k => {
      if (k in req.body) updates[k] = req.body[k];
    });

    if (updates.key) {
      const dupe = await Cluster.findOne({
        _id: { $ne: req.params.id },
        userId: req.user.id,
        key: updates.key
      }).collation({ locale: 'en', strength: 2 });
      if (dupe) return res.status(409).json({ error: 'Cluster key already exists' });
    }

    const doc = await Cluster.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      { $set: updates },
      { new: true }
    );
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json({ data: doc });
  } catch (e) {
    if (e?.code === 11000) return res.status(409).json({ error: 'Cluster key already exists' });
    res.status(500).json({ error: 'Failed to update cluster' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const doc = await Cluster.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
    if (!doc) return res.status(404).json({ error: 'Not found' });
    // Optional: also $pull this key from tasks/entries here.
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to delete cluster' });
  }
});

/* ── Dashboard + helpers your UI calls ──────────────────── */

// Add a specific task to a date and ensure membership in this cluster
router.post('/:key/tasks/:taskId/add-to-date', async (req, res) => {
  try {
    const key   = slugifyKey(req.params.key);
    const dateQ = req.query.date;
    const date  = dateQ && /^\d{4}-\d{2}-\d{2}$/.test(dateQ) ? dateQ : todayISOInToronto();

    const task = await Task.findOne({ _id: req.params.taskId, userId: req.user.id });
    if (!task) return res.status(404).json({ error: 'Task not found' });

    if (!Array.isArray(task.clusters)) task.clusters = [];
    if (!task.clusters.includes(key)) task.clusters.unshift(key);
    task.dueDate = date;
    await task.save();

    res.json({ data: task });
  } catch (e) {
    res.status(500).json({ error: 'Failed to add to date' });
  }
});

// Carry over yesterday's unfinished tasks for this cluster
router.post('/:key/tasks/carryover', async (req, res) => {
  try {
    const key   = slugifyKey(req.params.key);
    const dateQ = req.query.date;
    const today = dateQ && /^\d{4}-\d{2}-\d{2}$/.test(dateQ) ? dateQ : todayISOInToronto();
    const yday  = isoMinusDays(today, 1);

    const result = await Task.updateMany(
      { userId: req.user.id, completed: false, dueDate: yday, clusters: key },
      { $set: { dueDate: today } }
    );

    res.json({ ok: true, moved: result.modifiedCount || 0, from: yday, to: today });
  } catch (e) {
    res.status(500).json({ error: 'Failed to carry over tasks' });
  }
});

// Dashboard data: tasks + recent entries for this cluster
router.get('/:key/dashboard', async (req, res) => {
  try {
    const key   = slugifyKey(req.params.key);
    const dateQ = req.query.date;
    const today = dateQ && /^\d{4}-\d{2}-\d{2}$/.test(dateQ) ? dateQ : todayISOInToronto();

    const [tasksToday, tasksOverdue, tasksUpcoming, tasksNoDate, recentEntries] = await Promise.all([
      Task.find({ userId: req.user.id, completed: false, dueDate: today, clusters: key }).sort({ createdAt: -1 }),
      Task.find({ userId: req.user.id, completed: false, dueDate: { $lt: today }, clusters: key }).sort({ dueDate: 1 }),
      Task.find({ userId: req.user.id, completed: false, dueDate: { $gt: today }, clusters: key }).sort({ dueDate: 1 }).limit(50),
      Task.find({ userId: req.user.id, completed: false, $or: [{ dueDate: null }, { dueDate: '' }], clusters: key }).sort({ createdAt: -1 }).limit(50),
      Entry.find({ userId: req.user.id, cluster: key }).sort({ date: -1, createdAt: -1 }).limit(50)
    ]);

    res.json({
      data: {
        date: today,
        key,
        tasks: {
          today: tasksToday,
          overdue: tasksOverdue,
          upcoming: tasksUpcoming,
          unscheduled: tasksNoDate
        },
        recentEntries
      }
    });
  } catch (e) {
    res.status(500).json({ error: 'Failed to load cluster dashboard' });
  }
});

export default router;
