import express from 'express';
import Task from '../models/Task.js';
import auth from '../middleware/auth.js';

const router = express.Router();

/* helpers */
function toDayRange(isoDate) {
  // isoDate is "YYYY-MM-DD"
  const start = new Date(`${isoDate}T00:00:00.000Z`);
  const end   = new Date(`${isoDate}T23:59:59.999Z`);
  return { start, end };
}
function parseMaybeISODate(val) {
  if (!val) return undefined;
  // Accept "YYYY-MM-DD" or any JS-parsable date
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return new Date(`${val}T00:00:00.000Z`);
  const d = new Date(val);
  return isNaN(d) ? undefined : d;
}

/* GET /api/tasks?date=YYYY-MM-DD or ?dueDate=YYYY-MM-DD */
router.get('/', async (req, res) => {
  const date = req.query.date || req.query.dueDate;
  const query = { userId: req.user.userId };

  if (date) {
    const { start, end } = toDayRange(date);
    query.dueDate = { $gte: start, $lt: end };
  }

  try {
    const tasks = await Task.find(query)
      .sort({ completed: 1, dueDate: 1, priority: 1, createdAt: 1 });
    res.json(tasks);
  } catch (err) {
    console.error('GET /tasks error:', err);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

/* POST /api/tasks */
router.post('/', auth, async (req, res) => {
  try {
    // backward-compat: allow "content" to map to title if title missing
    let {
      title,
      notes,
      content,        // legacy
      dueDate,
      repeat,
      goalId,
      entryId,
      clusters
    } = req.body;

    if (!title && content) title = String(content).trim();
    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Task title required' });
    }

    const due = parseMaybeISODate(dueDate);
    const task = new Task({
      userId : req.user.userId,
      title  : title.trim(),
      notes  : notes || undefined,
      dueDate: due,
      repeat : repeat || undefined,
      goalId : goalId || undefined,
      entryId: entryId || undefined,
      clusters: Array.isArray(clusters) ? clusters : (clusters ? [clusters] : [])
    });

    const saved = await task.save();
    res.status(201).json(saved);
  } catch (err) {
    console.error('POST /tasks error:', err);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

/* PUT /api/tasks/:id */
router.put('/:id', auth, async (req, res) => {
  try {
    const update = { ...req.body };

    // normalize fields
    if (update.title) update.title = String(update.title).trim();
    if (update.dueDate) update.dueDate = parseMaybeISODate(update.dueDate);
    if (update.clusters) {
      update.clusters = Array.isArray(update.clusters)
        ? update.clusters
        : [update.clusters];
    }

    const updated = await Task.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.userId },
      update,
      { new: true }
    );
    if (!updated) return res.status(404).json({ error: 'Task not found' });
    res.json(updated);
  } catch (err) {
    console.error('PUT /tasks/:id error:', err);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

/* PUT /api/tasks/:id/carry-forward?days=1  (MVP) */
router.put('/:id/carry-forward', auth, async (req, res) => {
  try {
    const days = Number(req.query.days ?? 1);
    const task = await Task.findOne({ _id: req.params.id, userId: req.user.userId });
    if (!task) return res.status(404).json({ error: 'Task not found' });

    const base = task.dueDate ? new Date(task.dueDate) : new Date();
    base.setUTCDate(base.getUTCDate() + (Number.isFinite(days) ? days : 1));
    task.dueDate = base;
    await task.save();
    res.json(task);
  } catch (err) {
    console.error('PUT /tasks/:id/carry-forward error:', err);
    res.status(500).json({ error: 'Failed to carry task forward' });
  }
});

/* DELETE /api/tasks/:id */
router.delete('/:id', auth, async (req, res) => {
  try {
    const deleted = await Task.findOneAndDelete({
      _id: req.params.id,
      userId: req.user.userId
    });
    if (!deleted) return res.status(404).json({ error: 'Task not found' });
    res.json({ message: 'Task deleted' });
  } catch (err) {
    console.error('DELETE /tasks/:id error:', err);
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

export default router;
