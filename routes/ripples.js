// routes/ripples.js
import express  from 'express';
import Ripple   from '../models/Ripple.js';
import Task     from '../models/Task.js';       // NEW ✔
import auth     from '../middleware/auth.js';

const router = express.Router();
router.use(auth);

/* ───────────── GET /api/ripples/pending ───────────── */
router.get('/pending', async (req, res) => {
  try {
    const filter = { userId: req.user.userId, status: 'pending' };
    if (req.query.cluster) filter.assignedCluster = req.query.cluster;

    const ripples = await Ripple
      .find(filter)
      .sort({ priority: -1, confidence: -1, createdAt: -1 });

    res.json(ripples);
  } catch {
    res.status(500).json({ error: 'Failed to fetch pending ripples' });
  }
});

/* ───────────── GET /api/ripples/date/:date ───────────── */
router.get('/date/:date', async (req, res) => {
  try {
    const ripples = await Ripple
      .find({
        userId   : req.user.userId,
        entryDate: req.params.date
      })
      .sort({ priority: -1, confidence: -1 });

    res.json(ripples);
  } catch {
    res.status(500).json({ error: 'Failed to fetch ripples' });
  }
});

/* ───────────── GET /api/ripples/extracted/:stamp ───────────── */
router.get('/extracted/:stamp', async (req, res) => {
  try {
    const regex = new RegExp(`^${req.params.stamp}`); // e.g. 2025-08-05
    const ripples = await Ripple
      .find({
        userId       : req.user.userId,
        extractedDate: { $regex: regex }
      })
      .sort({ priority: -1, confidence: -1 });

    res.json(ripples);
  } catch {
    res.status(500).json({ error: 'Failed to fetch ripples' });
  }
});

/* ───────────── PUT /api/ripples/:id/approve ───────────── */
router.put('/:id/approve', async (req, res) => {
  try {
    const { assignedCluster } = req.body;

    const ripple = await Ripple.findOne({
      _id   : req.params.id,
      userId: req.user.userId,
      status: 'pending'
    });
    if (!ripple) {
      return res.status(404).json({ error: 'Ripple not found or already processed' });
    }

    /* Create a Task from the ripple (expand later for appointments, etc.) */
    const task = await new Task({
      userId : req.user.userId,
      title  : ripple.extractedText,
      cluster: assignedCluster || ripple.assignedCluster || null,
      priority: ripple.priority || 'low'
    }).save();

    ripple.status         = 'approved';
    ripple.assignedCluster = assignedCluster || ripple.assignedCluster;
    ripple.createdTaskId  = task._id;
    await ripple.save();

    res.json({ ripple, task });
  } catch (err) {
    console.error('❌ Approve ripple error:', err);
    res.status(500).json({ error: 'Failed to approve ripple' });
  }
});

/* ───────────── PUT /api/ripples/:id/dismiss ───────────── */
router.put('/:id/dismiss', async (req, res) => {
  try {
    const ripple = await Ripple.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.userId },
      { status: 'dismissed' },
      { new: true }
    );
    if (!ripple) return res.status(404).json({ error: 'Ripple not found' });
    res.json(ripple);
  } catch (err) {
    console.error('❌ Dismiss ripple error:', err);
    res.status(500).json({ error: 'Failed to dismiss ripple' });
  }
});

export default router;
