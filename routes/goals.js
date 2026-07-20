import express from 'express';
import auth from '../middleware/auth.js';
import Goal from '../models/Goal.js';
import Task from '../models/Task.js';
import Entry from '../models/Entry.js';
import { resolveClusterIdForOwner, resolveClusterIdsForOwner } from '../utils/clusterIds.js';
import { logSafeError } from '../utils/errorHandler.js';

const router = express.Router();

// GET all goals for the user
router.get('/', auth, async (req, res) => {
  try {
    const filters = { userId: req.user.userId };
    const clusterFilters = [];

    if (req.query.cluster) {
      clusterFilters.push({ cluster: req.query.cluster });
    }

    if (req.query.clusterId) {
      const resolved = await resolveClusterIdForOwner(req.user.userId, req.query.clusterId);
      if (!resolved) {
        return res.json([]);
      }
      clusterFilters.push({ clusters: resolved });
    }

    if (clusterFilters.length === 1) {
      Object.assign(filters, clusterFilters[0]);
    } else if (clusterFilters.length > 1) {
      filters.$or = clusterFilters;
    }

    const goals = await Goal.find(filters).sort({ createdAt: -1 });
    res.json(goals);
  } catch {
    res.status(500).json({ error: 'Failed to load goals' });
  }
});

// POST new goal
router.post('/', auth, async (req, res) => {
  try {
    const { cluster, steps } = req.body;
    const title = String(req.body?.title || '').trim();
    const description = String(req.body?.description || '').trim();

    if (!title) {
      return res.status(400).json({ error: 'Goal title is required' });
    }

    let clusterIds = await resolveClusterIdsForOwner(req.user.userId, req.body?.clusters);
    if (!clusterIds.length && req.body?.clusterId) {
      const resolved = await resolveClusterIdForOwner(req.user.userId, req.body.clusterId);
      if (resolved) clusterIds = [resolved];
    } else if (!clusterIds.length && cluster) {
      const resolved = await resolveClusterIdForOwner(req.user.userId, cluster);
      if (resolved) clusterIds = [resolved];
    }
    const goal = new Goal({
      userId: req.user.userId,
      title,
      description: description || '',
      cluster: cluster || null,
      clusters: clusterIds,
      steps: Array.isArray(steps) ? steps : [],
    });
    await goal.save();
    res.status(201).json(goal);
  } catch {
    res.status(500).json({ error: 'Failed to create goal' });
  }
});

// PATCH goal (update title, description, cluster, or steps)
router.patch('/:id', auth, async (req, res) => {
  try {
    const updates = {};
    for (const key of ['title', 'description', 'cluster', 'steps']) {
      if (Object.prototype.hasOwnProperty.call(req.body || {}, key)) updates[key] = req.body[key];
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'clusters')) {
      updates.clusters = await resolveClusterIdsForOwner(req.user.userId, req.body.clusters);
    } else if (Object.prototype.hasOwnProperty.call(req.body || {}, 'clusterId')) {
      const resolved = await resolveClusterIdForOwner(req.user.userId, req.body.clusterId);
      updates.clusters = resolved ? [resolved] : [];
    }
    if (!Object.keys(updates).length) return res.status(400).json({ error: 'No valid updates provided' });

    const updated = await Goal.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.userId },
      updates,
      { new: true, runValidators: true }
    );
    if (!updated) return res.status(404).json({ error: 'Goal not found' });
    res.json(updated);
  } catch {
    res.status(500).json({ error: 'Failed to update goal' });
  }
});

// PATCH single step completed toggle
router.patch('/:id/step/:index', auth, async (req, res) => {
  try {
    const goal = await Goal.findOne({ _id: req.params.id, userId: req.user.userId });
    if (!goal) return res.status(404).json({ error: 'Goal not found' });

    if (!/^\d+$/.test(String(req.params.index || ''))) {
      return res.status(400).json({ error: 'Invalid step index' });
    }

    const i = Number(req.params.index);
    if (i < 0 || i >= goal.steps.length) {
      return res.status(400).json({ error: 'Invalid step index' });
    }

    goal.steps[i].completed = !goal.steps[i].completed;
    await goal.save();
    res.json(goal);
  } catch {
    res.status(500).json({ error: 'Failed to update step' });
  }
});

// DELETE goal
router.delete('/:id', auth, async (req, res) => {
  try {
    const ownedGoal = await Goal.findOne({ _id: req.params.id, userId: req.user.userId });
    if (!ownedGoal) return res.status(404).json({ error: 'Goal not found' });

    // A goal is an organizer, not the owner of journal or task content. Remove
    // owned relationships before deleting it so retained content never points
    // at a missing goal.
    await Promise.all([
      Task.updateMany(
        { userId: req.user.userId, goalId: req.params.id },
        { $set: { goalId: null } }
      ),
      Entry.updateMany(
        { userId: req.user.userId, linkedGoal: req.params.id },
        { $set: { linkedGoal: null } }
      ),
    ]);
    const deleted = await Goal.findOneAndDelete({ _id: req.params.id, userId: req.user.userId });
    if (!deleted) {
      // The owned goal existed before cleanup; reaching this branch means a
      // concurrent delete won the race. The relationships were already safely
      // detached from this user's content, so report a conflict rather than a
      // misleading not-found success.
      return res.status(409).json({ error: 'Goal changed while it was being deleted' });
    }
    res.json({ success: true });
  } catch (error) {
    logSafeError('goals delete failed', error);
    res.status(500).json({ error: 'Failed to delete goal' });
  }
});

// GET all goals for a cluster
router.get('/cluster/:cluster', auth, async (req, res) => {
  try {
    const filters = { userId: req.user.userId };
    const clusterFilters = [{ cluster: req.params.cluster }];
    const resolved = await resolveClusterIdForOwner(req.user.userId, req.params.cluster);
    if (resolved) clusterFilters.push({ clusters: resolved });

    if (clusterFilters.length === 1) Object.assign(filters, clusterFilters[0]);
    else filters.$or = clusterFilters;

    const goals = await Goal.find(filters).sort({ createdAt: -1 });
    res.json(goals);
  } catch {
    res.status(500).json({ error: 'Failed to load cluster goals' });
  }
});

export default router;
