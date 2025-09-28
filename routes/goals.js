import express from 'express';
import auth from '../middleware/auth.js';
import Goal from '../models/Goal.js';
import { normalizeClusterIds, resolveClusterIdForOwner } from '../utils/clusterIds.js';

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
    const { title, description, cluster, steps } = req.body;
    let clusterIds = normalizeClusterIds(req.body?.clusters);
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
    const updates = { ...req.body };
    if (Object.prototype.hasOwnProperty.call(updates, 'clusters')) {
      updates.clusters = normalizeClusterIds(updates.clusters);
    } else if (Object.prototype.hasOwnProperty.call(updates, 'clusterId')) {
      const resolved = await resolveClusterIdForOwner(req.user.userId, updates.clusterId);
      updates.clusters = resolved ? [resolved] : [];
    }
    delete updates.clusterId;

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

    const i = parseInt(req.params.index, 10);
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
    await Goal.findOneAndDelete({ _id: req.params.id, userId: req.user.userId });
    res.json({ success: true });
  } catch {
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
