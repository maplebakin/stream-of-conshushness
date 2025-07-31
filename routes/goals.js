import express from 'express';
import Goal from '../models/Goal.js';
import auth from '../middleware/auth.js';
const router = express.Router();

// Get all goals for user
router.get('/', auth, async (req, res) => {
  const goals = await Goal.find({ userId: req.user._id });
  res.json(goals);
});

// Create new goal
router.post('/', auth, async (req, res) => {
  const { title, description, steps, cluster } = req.body;
  const goal = new Goal({ userId: req.user._id, title, description, steps, cluster });
  await goal.save();
  res.status(201).json(goal);
});

// Update goal (edit title, description, steps)
router.put('/:id', auth, async (req, res) => {
  const updated = await Goal.findOneAndUpdate(
    { _id: req.params.id, userId: req.user._id },
    req.body,
    { new: true }
  );
  res.json(updated);
});

// Delete goal
router.delete('/:id', auth, async (req, res) => {
  await Goal.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
  res.json({ success: true });
});

export default router;
