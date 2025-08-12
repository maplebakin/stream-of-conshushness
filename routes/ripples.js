// routes/ripples.js
import express from 'express';
import mongoose from 'mongoose';
import auth from '../middleware/auth.js';

import Ripple from '../models/Ripple.js';
import Task from '../models/Task.js';
import SuggestedTask from '../models/SuggestedTask.js';

const router = express.Router();
router.use(auth);

/* utils */
const isId = (id) => mongoose.Types.ObjectId.isValid(id);
const toArray = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);
const normalizeClusters = (val) => {
  const arr = toArray(val)
    .map(String)
    .map((s) => s.trim())
    .filter(Boolean);
  // unique while preserving order
  return [...new Set(arr)];
};
const getUserId = (req) => req.user?._id || req.user?.userId || req.user?.id;

/* ───────────── GET /api/ripples/:date  (YYYY-MM-DD) ─────────────
   Returns PENDING ripples for that entry date (for Daily review UI)
------------------------------------------------------------------ */
router.get('/:date', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { date } = req.params;

    const ripples = await Ripple.find({
      userId,
      entryDate: date,
      $or: [{ status: { $exists: false } }, { status: 'pending' }],
    }).sort({ createdAt: -1 });

    res.json(ripples);
  } catch (err) {
    console.error('❌ Error fetching daily ripples:', err);
    res.status(500).json({ error: 'Server error fetching ripples' });
  }
});

/* ───────────── PUT /api/ripples/:id/approve ─────────────
   Approves a ripple → creates Task.
   Body (all optional): {
     title, priority, dueDate, recurrence,
     assignedCluster,           // string
     assignedClusters           // string|string[]
   }
------------------------------------------------------------------ */
router.put('/:id/approve', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;
    if (!isId(id)) return res.status(400).json({ error: 'Invalid ripple id' });

    const ripple = await Ripple.findOne({ _id: id, userId });
    if (!ripple) return res.status(404).json({ error: 'Ripple not found' });

    // Already approved? Return existing task.
    if (ripple.status === 'approved' && ripple.createdTaskId) {
      const existing = await Task.findOne({ _id: ripple.createdTaskId, userId });
      return res.json({ ripple, task: existing, reused: true });
    }

    // Determine clusters from body or ripple
    const bodyClusters = normalizeClusters(
      req.body?.assignedClusters ?? req.body?.assignedCluster
    );
    const rippleClusters = normalizeClusters(
      ripple.assignedClusters ?? ripple.assignedCluster
    );
    const clusters = bodyClusters.length ? bodyClusters : rippleClusters;

    // Build Task draft
    const draft = {
      userId,
      title: (req.body?.title ?? ripple.extractedText)?.toString().trim(),
      priority: req.body?.priority ?? ripple.priority ?? 'low',
      clusters, // <-- Task schema uses { clusters: [String] }
    };
    if (req.body?.dueDate ?? ripple.dueDate) draft.dueDate = req.body?.dueDate ?? ripple.dueDate;
    if (req.body?.recurrence ?? ripple.recurrence) draft.repeat = req.body?.recurrence ?? ripple.recurrence;

    // Optional traceability (safe to keep even if Task schema ignores them)
    draft.sourceRippleId = ripple._id;
    draft.sourceEntryId = ripple.sourceEntryId;

    const task = await new Task(draft).save();

    // Update ripple status + echo assigned clusters for UI consistency
    ripple.status = 'approved';
    ripple.createdTaskId = task._id;
    ripple.assignedClusters = clusters;
    ripple.assignedCluster = clusters[0] ?? null; // backward-compat
    if (draft.dueDate) ripple.dueDate = draft.dueDate;
    if (draft.repeat) ripple.recurrence = draft.repeat;
    await ripple.save();

    // Clean up any SuggestedTask mirrors
    await SuggestedTask.deleteMany({ userId, sourceRippleId: ripple._id });

    res.json({ ripple, task });
  } catch (err) {
    console.error('❌ Error approving ripple:', err);
    res.status(500).json({ error: 'Server error approving ripple' });
  }
});

/* ───────────── PUT /api/ripples/:id/dismiss ─────────────
   Marks ripple as dismissed + removes any SuggestedTask
------------------------------------------------------------------ */
router.put('/:id/dismiss', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;
    if (!isId(id)) return res.status(400).json({ error: 'Invalid ripple id' });

    const ripple = await Ripple.findOneAndUpdate(
      { _id: id, userId },
      { status: 'dismissed' },
      { new: true }
    );
    if (!ripple) return res.status(404).json({ error: 'Ripple not found' });

    await SuggestedTask.deleteMany({ userId, sourceRippleId: ripple._id });

    res.json({ ripple, message: 'Ripple dismissed' });
  } catch (err) {
    console.error('❌ Error dismissing ripple:', err);
    res.status(500).json({ error: 'Server error dismissing ripple' });
  }
});

/* ───────────── PUT /api/ripples/:id/assign-clusters ─────────────
   Updates assigned clusters without approving yet.
   Body: { assignedClusters?: string|string[], assignedCluster?: string }
------------------------------------------------------------------ */
router.put('/:id/assign-clusters', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;
    if (!isId(id)) return res.status(400).json({ error: 'Invalid ripple id' });

    const clusters = normalizeClusters(
      req.body?.assignedClusters ?? req.body?.assignedCluster
    );

    const update = {
      assignedClusters: clusters,
      assignedCluster: clusters[0] ?? null,
    };

    const ripple = await Ripple.findOneAndUpdate(
      { _id: id, userId },
      update,
      { new: true }
    );
    if (!ripple) return res.status(404).json({ error: 'Ripple not found' });

    res.json(ripple);
  } catch (err) {
    console.error('❌ Error assigning clusters to ripple:', err);
    res.status(500).json({ error: 'Server error updating ripple' });
  }
});

/* ───────────── POST /api/ripples/bulk/approve ─────────────
   Body: {
     ids: [rippleId...],
     defaults?: { title?, priority?, dueDate?, recurrence?, assignedClusters? | assignedCluster? }
   }
------------------------------------------------------------------ */
router.post('/bulk/approve', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { ids = [], defaults = {} } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids[] required' });
    }

    const ripples = await Ripple.find({ _id: { $in: ids }, userId });
    const defClusters = normalizeClusters(
      defaults.assignedClusters ?? defaults.assignedCluster
    );

    const results = [];
    for (const r of ripples) {
      const clusters = (defClusters.length
        ? defClusters
        : normalizeClusters(r.assignedClusters ?? r.assignedCluster));

      const draft = {
        userId,
        title: (defaults.title ?? r.extractedText)?.toString().trim(),
        priority: defaults.priority ?? r.priority ?? 'low',
        clusters,
      };
      if (defaults.dueDate ?? r.dueDate) draft.dueDate = defaults.dueDate ?? r.dueDate;
      if (defaults.recurrence ?? r.recurrence) draft.repeat = defaults.recurrence ?? r.recurrence;

      draft.sourceRippleId = r._id;
      draft.sourceEntryId = r.sourceEntryId;

      const task = await new Task(draft).save();

      r.status = 'approved';
      r.createdTaskId = task._id;
      r.assignedClusters = clusters;
      r.assignedCluster = clusters[0] ?? null;
      if (draft.dueDate) r.dueDate = draft.dueDate;
      if (draft.repeat) r.recurrence = draft.repeat;
      await r.save();

      await SuggestedTask.deleteMany({ userId, sourceRippleId: r._id });

      results.push({ rippleId: r._id, taskId: task._id });
    }

    res.json({ approved: results.length, results });
  } catch (err) {
    console.error('❌ Error bulk-approving ripples:', err);
    res.status(500).json({ error: 'Server error bulk-approving ripples' });
  }
});

export default router;
