// routes/sections.js
import express from 'express';
import auth from '../middleware/auth.js';
import Section from '../models/Section.js';
import Task from '../models/Task.js';
import Entry from '../models/Entry.js';

const router = express.Router();
router.use(auth);

/* Toronto date helpers */
function todayISOInToronto(base = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit'
  });
  const parts = fmt.formatToParts(base);
  const y = parts.find(p => p.type === 'year').value;
  const m = parts.find(p => p.type === 'month').value;
  const d = parts.find(p => p.type === 'day').value;
  return `${y}-${m}-${d}`;
}
function isoMinusDays(iso, n) {
  const [Y,M,D] = iso.split('-').map(x => parseInt(x,10));
  const dt = new Date(Date.UTC(Y, M-1, D, 12, 0, 0));
  dt.setUTCDate(dt.getUTCDate() - n);
  return todayISOInToronto(dt);
}

/* ─── Sections CRUD ─── */

router.get('/', async (req, res) => {
  try {
    const sections = await Section.find({ userId: req.user.id })
      .sort({ pinned: -1, order: 1, createdAt: 1 });
    res.json({ data: sections });
  } catch (e) {
    res.status(500).json({ error: 'Failed to list sections' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { key, label, color, icon, description, pinned, order } = req.body || {};
    if (!key || !label) return res.status(400).json({ error: 'key and label are required' });

    const doc = await Section.create({
      userId: req.user.id,
      key: key.trim(),
      label: label.trim(),
      color: color || '#5cc2ff',
      icon : icon  || '📚',
      description: description || '',
      pinned: !!pinned,
      order: typeof order === 'number' ? order : 0
    });

    res.status(201).json({ data: doc });
  } catch (e) {
    if (e.code === 11000) return res.status(409).json({ error: 'Section key already exists' });
    res.status(500).json({ error: 'Failed to create section' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const updates = {};
    ['key','label','color','icon','description','pinned','order'].forEach(k => {
      if (k in req.body) updates[k] = req.body[k];
    });
    const doc = await Section.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      { $set: updates }, { new: true }
    );
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json({ data: doc });
  } catch (e) {
    res.status(500).json({ error: 'Failed to update section' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const doc = await Section.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
    if (!doc) return res.status(404).json({ error: 'Not found' });

    if (String(req.query.scrub || '') === '1') {
      await Task.updateMany(
        { userId: req.user.id, sections: doc.key },
        { $pull: { sections: doc.key } }
      );
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to delete section' });
  }
});

/* ─── Utilities ─── */

// Add a specific task to date and ensure membership in section
router.post('/:key/tasks/:taskId/add-to-date', async (req, res) => {
  try {
    const key   = req.params.key;
    const dateQ = req.query.date;
    const date  = dateQ && /^\d{4}-\d{2}-\d{2}$/.test(dateQ) ? dateQ : todayISOInToronto();

    const task = await Task.findOne({ _id: req.params.taskId, userId: req.user.id });
    if (!task) return res.status(404).json({ error: 'Task not found' });

    if (!task.sections.includes(key)) task.sections.unshift(key);
    task.dueDate = date;
    await task.save();

    res.json({ data: task });
  } catch (e) {
    res.status(500).json({ error: 'Failed to add to date' });
  }
});

// Carry over yesterday's unfinished tasks for this section
router.post('/:key/tasks/carryover', async (req, res) => {
  try {
    const key   = req.params.key;
    const dateQ = req.query.date;
    const today = dateQ && /^\d{4}-\d{2}-\d{2}$/.test(dateQ) ? dateQ : todayISOInToronto();
    const yday  = isoMinusDays(today, 1);

    const result = await Task.updateMany(
      { userId: req.user.id, completed: false, dueDate: yday, sections: key },
      { $set: { dueDate: today } }
    );

    res.json({ ok: true, moved: result.modifiedCount || 0, from: yday, to: today });
  } catch (e) {
    res.status(500).json({ error: 'Failed to carry over tasks' });
  }
});

// Dashboard: tasks + recent entries for this section
router.get('/:key/dashboard', async (req, res) => {
  try {
    const key   = req.params.key;
    const dateQ = req.query.date;
    const today = dateQ && /^\d{4}-\d{2}-\d{2}$/.test(dateQ) ? dateQ : todayISOInToronto();

    const [tasksToday, tasksOverdue, tasksUpcoming, tasksNoDate, recentEntries] = await Promise.all([
      Task.find({ userId: req.user.id, completed: false, dueDate: today, sections: key }).sort({ createdAt: -1 }),
      Task.find({ userId: req.user.id, completed: false, dueDate: { $lt: today }, sections: key }).sort({ dueDate: 1 }),
      Task.find({ userId: req.user.id, completed: false, dueDate: { $gt: today }, sections: key }).sort({ dueDate: 1 }).limit(50),
      Task.find({ userId: req.user.id, completed: false, $or: [{ dueDate: null }, { dueDate: '' }], sections: key }).sort({ createdAt: -1 }).limit(50),
      Entry.find({ userId: req.user.id, section: key }).sort({ date: -1, createdAt: -1 }).limit(50)
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
    res.status(500).json({ error: 'Failed to load section dashboard' });
  }
});

export default router;
