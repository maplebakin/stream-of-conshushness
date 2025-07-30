// routes/tasks.js
import express from 'express';
import Task from '../models/Todo.js'; // still using your Todo model
import auth from '../middleware/auth.js'; // your existing JWT auth

const router = express.Router();

// GET all tasks
router.get('/', auth, async (req, res) => {
  const tasks = await Task.find({ userId: req.user.userId }).sort({ dueDate: 1 });
  res.json(tasks);
});

// GET today’s tasks
router.get('/today', auth, async (req, res) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  const tasks = await Task.find({
    userId: req.user.userId,
    dueDate: { $gte: today, $lt: tomorrow }
  });
  res.json(tasks);
});

// POST new task
router.post('/', auth, async (req, res) => {
  const { content, dueDate, entryId, linkedGoal, cluster, repeat } = req.body;

  const task = new Task({
    userId: req.user.userId,
    content,
    dueDate,
    entryId,
    linkedGoal,
    cluster,
    repeat,
    completed: false
  });

  await task.save();
  res.status(201).json(task);
});

// PUT mark task complete
router.put('/:id/complete', auth, async (req, res) => {
  const task = await Task.findOneAndUpdate(
    { _id: req.params.id, userId: req.user.userId },
    { completed: true },
    { new: true }
  );
  res.json(task);
});

// DELETE task
router.delete('/:id', auth, async (req, res) => {
  await Task.findOneAndDelete({ _id: req.params.id, userId: req.user.userId });
  res.json({ success: true });
});

export default router;
