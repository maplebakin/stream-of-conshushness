// routes/ripples.js
import express from 'express';
import mongoose from 'mongoose';
import auth from '../middleware/auth.js';

import Ripple from '../models/Ripple.js';
import Task from '../models/Task.js';
// SuggestedTask may not always exist in your build; we guard its usage.
import SuggestedTask from '../models/SuggestedTask.js';

const router = express.Router();
router.use(auth);

/* ───────────── helpers ───────────── */
const isId = (id) => mongoose.Types.ObjectId.isValid(id);
const toArray = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);
const normalizeClusters = (val) => {
  const arr = toArray(val).map(String).map(s => s.trim()).filter(Boolean);
  return [...new Set(arr)]; // unique while preserving order
};
const getUserId = (req) =>
  req?.user?.userId || req?.user?._id || req?.user?.id;

const isISODate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

function todayISOInToronto() {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric', month: '2-digit', day: '2-digit'
  });
  const p = fmt.formatToParts(new Date());
  return `${p.find(x=>x.type==='year').value}-${p.find(x=>x.type==='month').value}-${p.find(x=>x.type==='day').value}`;
}

async function safeDeleteSuggestedTasks(filter) {
  try {
    if (SuggestedTask && typeof SuggestedTask.deleteMany === 'function') {
      await SuggestedTask.deleteMany(filter);
    }
  } catch (e) {
    // Non-fatal; keep logs quiet but traceable
    console.warn('⚠️ SuggestedTask cleanup skipped:', e.message);
  }
}

/* ───────────── GET /api/ripples/pending?date=YYYY-MM-DD ─────────────
   Alias for older clients. Defaults to today's date if missing.
   NOTE: Prefer GET /api/ripples/:date going forward.
------------------------------------------------------------------ */
router.get('/pending', async (req, res) => {
  try {
    const userId = getUserId(req);
    const date = req.query.date || todayISOInToronto();
    if (!isISODate(date)) return res.status(400).json({ error: 'Invalid date format (YYYY-MM-DD)' });

    const ripples = await Ripple.find({
      userId,
      entryDate: date,
      $or: [{ status: { $exists: false } }, { status: 'pending' }],
    }).sort({ createdAt: -1 });

    res.json(ripples);
  } catch (err) {
    console.error('❌ Error fetching pending ripples:', err);
    res.status(500).json({ error: 'Server error fetching ripples' });
  }
});

/* ───────────── GET /api/ripples/:date  (YYYY-MM-DD) ─────────────
   Returns PENDING ripples for that entry date (for Daily review UI)
------------------------------------------------------------------ */
router.get('/:date', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { date } = req.params;
    if (!isISODate(date)) return res.status(400).json({ error: 'Invalid date format (YYYY-MM-DD)' });

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

    // If already approved, try to return existing task; recreate if missing.
    if (ripple.status === 'approved' && ripple.createdTaskId) {
      const existing = await Task.findOne({ _id: ripple.createdTaskId, userId });
      if (existing) {
        return res.json({ ripple, task: existing, reused: true });
      }
      // fallthrough to recreate task if prior one was deleted
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
    const titleRaw = (req.body?.title ?? ripple.extractedText ?? '').toString().trim();
    const draft = {
      userId,
      title: titleRaw || 'Untitled task',
      priority: req.body?.priority ?? ripple.priority ?? 'low',
      clusters, // Task schema uses { clusters: [String] }
    };
    if (req.body?.dueDate ?? ripple.dueDate) draft.dueDate = req.body?.dueDate ?? ripple.dueDate;
    if (req.body?.recurrence ?? ripple.recurrence) draft.repeat = req.body?.recurrence ?? ripple.recurrence;

    // Optional traceability
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
    await safeDeleteSuggestedTasks({ userId, sourceRippleId: ripple._id });

    res.json({ ripple, task, reused: false });
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

    await safeDeleteSuggestedTasks({ userId, sourceRippleId: ripple._id });

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

      const titleRaw = (defaults.title ?? r.extractedText ?? '').toString().trim();
      const draft = {
        userId,
        title: titleRaw || 'Untitled task',
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

      await safeDeleteSuggestedTasks({ userId, sourceRippleId: r._id });

      results.push({ rippleId: r._id, taskId: task._id });
    }

    res.json({ approved: results.length, results });
  } catch (err) {
    console.error('❌ Error bulk-approving ripples:', err);
    res.status(500).json({ error: 'Server error bulk-approving ripples' });
  }
});

export default router;
