// backend/routes/ripples.js
// Mount with: app.use('/api', ripplesRouter)
import express from 'express';
import Ripple from '../models/Ripple.js';
import Task from '../models/Task.js';
import auth from '../middleware/auth.js';

const router = express.Router();
router.use(auth);

// Toronto-safe YYYY-MM-DD
function todayISOInToronto() {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric', month: '2-digit', day: '2-digit'
  });
  const p = fmt.formatToParts(new Date());
  return `${p.find(x=>x.type==='year').value}-${p.find(x=>x.type==='month').value}-${p.find(x=>x.type==='day').value}`;
}

/* ───────────────────────── Ripples (day-scoped) */

/** GET /api/ripples/:date  → pending ripples for a given day */
router.get('/ripples/:date', async (req, res) => {
  try {
    const { date } = req.params;
    const userId = req.user._id || req.user.userId;
    const list = await Ripple.find({
      userId,
      entryDate: date,
      $or: [{ status: 'pending' }, { status: { $exists: false } }, { status: null }]
    })
      .sort({ createdAt: 1 })
      .lean();
    res.json(Array.isArray(list) ? list : []);
  } catch (err) {
    console.error('ripples list error', err);
    res.status(500).json({ error: 'Failed to load ripples' });
  }
});

/** PUT /api/ripples/:id/approve  → approve ripple and create a dated Task */
router.put('/ripples/:id/approve', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id || req.user.userId;

    const ripple = await Ripple.findOne({ _id: id, userId });
    if (!ripple) return res.status(404).json({ error: 'Ripple not found' });

    const dueDateISO = String(req.body?.dueDate || ripple.entryDate || todayISOInToronto());
    const title =
      (req.body?.title && String(req.body.title).trim()) ||
      ripple.extractedText ||
      'Untitled task';
    const priority = req.body?.priority || ripple.priority || 'low';
    const clusters = Array.isArray(req.body?.assignedClusters)
      ? req.body.assignedClusters
      : Array.isArray(ripple.assignedClusters)
      ? ripple.assignedClusters
      : [];

    const task = await Task.create({
      userId,
      title,
      dueDate: dueDateISO,
      priority,
      clusters,
      status: 'open',
      recurrence: ripple.recurrence || undefined,
      source: { type: 'ripple', rippleId: ripple._id }
    });

    ripple.status = 'approved';
    ripple.approvedTaskId = task._id;
    ripple.assignedClusters = clusters;
    await ripple.save();

    res.json({ ok: true, task });
  } catch (err) {
    console.error('approve ripple error', err);
    res.status(500).json({ error: 'Failed to approve ripple' });
  }
});

/** PUT /api/ripples/:id/dismiss  → mark ripple dismissed */
router.put('/ripples/:id/dismiss', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id || req.user.userId;

    const ripple = await Ripple.findOneAndUpdate(
      { _id: id, userId },
      { status: 'dismissed' },
      { new: true }
    );
    if (!ripple) return res.status(404).json({ error: 'Ripple not found' });

    res.json({ ok: true, rippleId: ripple._id });
  } catch (err) {
    console.error('dismiss ripple error', err);
    res.status(500).json({ error: 'Failed to dismiss ripple' });
  }
});

/* ───────────────────────── Suggested Tasks Inbox */

/** GET /api/suggested-tasks  → global inbox of pending suggestions */
router.get('/suggested-tasks', async (req, res) => {
  try {
    const userId = req.user._id || req.user.userId;
    const list = await Ripple.find({
      userId,
      type: 'suggestedTask',
      $or: [{ status: 'pending' }, { status: { $exists: false } }, { status: null }]
    })
      .sort({ createdAt: 1 })
      .lean();

    // Shape is compatible with your SuggestedTasksInbox.jsx
    res.json(Array.isArray(list) ? list : []);
  } catch (err) {
    console.error('suggested tasks list error', err);
    res.status(500).json({ error: 'Failed to load suggested tasks' });
  }
});

/** PUT /api/suggested-tasks/:id/accept  → accept suggestion to a dated Task */
router.put('/suggested-tasks/:id/accept', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id || req.user.userId;

    const ripple = await Ripple.findOne({ _id: id, userId, type: 'suggestedTask' });
    if (!ripple) return res.status(404).json({ error: 'Suggested task not found' });

    const dueDateISO = String(req.body?.dueDate || ripple.entryDate || todayISOInToronto());
    const title = ripple.extractedText || ripple.title || 'Untitled task';
    const priority = ripple.priority || 'low';
    const clusters = Array.isArray(ripple.assignedClusters) ? ripple.assignedClusters : [];

    const task = await Task.create({
      userId,
      title,
      dueDate: dueDateISO,
      priority,
      clusters,
      status: 'open',
      recurrence: ripple.recurrence || undefined,
      source: { type: 'suggestedTask', rippleId: ripple._id }
    });

    ripple.status = 'approved';
    ripple.approvedTaskId = task._id;
    await ripple.save();

    res.json({ ok: true, task });
  } catch (err) {
    console.error('accept suggested task error', err);
    res.status(500).json({ error: 'Failed to accept suggested task' });
  }
});

/** PUT /api/suggested-tasks/:id/reject  → dismiss suggestion */
router.put('/suggested-tasks/:id/reject', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id || req.user.userId;

    const ripple = await Ripple.findOneAndUpdate(
      { _id: id, userId, type: 'suggestedTask' },
      { status: 'dismissed' },
      { new: true }
    );
    if (!ripple) return res.status(404).json({ error: 'Suggested task not found' });

    res.json({ ok: true, rippleId: ripple._id });
  } catch (err) {
    console.error('reject suggested task error', err);
    res.status(500).json({ error: 'Failed to reject suggested task' });
  }
});

export default router;
