import express from 'express';
import auth from '../middleware/auth.js';
import Goal from '../models/Goal.js';

const router = express.Router();

// GET all goals for the user
router.get('/', auth, async (req, res) => {
  try {
    const goals = await Goal.find({ userId: req.user.userId }).sort({ createdAt: -1 });
    res.json(goals);
  } catch {
    res.status(500).json({ error: 'Failed to load goals' });
  }
});

// POST new goal
router.post('/', auth, async (req, res) => {
  try {
    const { title, description, cluster, steps } = req.body;
    const goal = new Goal({
      userId: req.user.userId,
      title,
      description: description || '',
      cluster: cluster || null,
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
    const updated = await Goal.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.userId },
      req.body,
      { new: true }
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
    const goals = await Goal.find({
      userId: req.user.userId,
      cluster: req.params.cluster,
    }).sort({ createdAt: -1 });
    res.json(goals);
  } catch {
    res.status(500).json({ error: 'Failed to load cluster goals' });
  }
});

export default router;
