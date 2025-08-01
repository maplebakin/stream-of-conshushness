import express from 'express';
import auth from '../middleware/auth.js';
import Habit from '../models/Habit.js';

const router = express.Router();

// GET all habits for user
router.get('/', auth, async (req, res) => {
  try {
    const habits = await Habit.find({ userId: req.user.userId }).sort({ createdAt: -1 });
    res.json(habits);
  } catch {
    res.status(500).json({ error: 'Failed to load habits' });
  }
});

// POST new habit
router.post('/', auth, async (req, res) => {
  try {
    const { title, cluster, repeat } = req.body;
    const habit = new Habit({
      userId: req.user.userId,
      title,
      cluster: cluster || null,
      repeat: repeat || null,
      history: [],
    });
    await habit.save();
    res.status(201).json(habit);
  } catch {
    res.status(500).json({ error: 'Failed to create habit' });
  }
});

// PATCH habit (add date to history or update fields)
router.patch('/:id', auth, async (req, res) => {
  try {
    const habit = await Habit.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.userId },
      req.body,
      { new: true }
    );
    if (!habit) return res.status(404).json({ error: 'Habit not found' });
    res.json(habit);
  } catch {
    res.status(500).json({ error: 'Failed to update habit' });
  }
});

// DELETE habit
router.delete('/:id', auth, async (req, res) => {
  try {
    await Habit.findOneAndDelete({ _id: req.params.id, userId: req.user.userId });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete habit' });
  }
});
// PATCH – mark habit as done for today
router.patch('/:id/done', auth, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0]; // "YYYY-MM-DD"
    const habit = await Habit.findOne({ _id: req.params.id, userId: req.user.userId });
    if (!habit) return res.status(404).json({ error: 'Habit not found' });

    if (!habit.history.includes(today)) {
      habit.history.push(today);
      await habit.save();
    }

    res.json({ message: 'Habit marked complete', habit });
  } catch {
    res.status(500).json({ error: 'Failed to mark habit done' });
  }
});


export default router;
