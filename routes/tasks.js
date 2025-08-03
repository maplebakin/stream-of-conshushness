import express from 'express';
import Task from '../models/Task.js';

const router = express.Router();

// GET /api/tasks?date=YYYY-MM-DD
router.get('/', async (req, res) => {
  const { date } = req.query;
  const query = { userId: req.user.userId };

  if (date) {
    query.$or = [
      { dueDate: date },
      { addedToToday: date }
    ];
  }

  try {
    const tasks = await Task.find(query).sort({ completed: 1, dueDate: 1 });
    res.json(tasks);
  } catch {
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

// POST /api/tasks
router.post('/', async (req, res) => {
  const {
    content,
    dueDate,
    clusters,     // array
    goalId,
    entryId,
    repeat,
    addedToToday  // optional array of date strings
  } = req.body;

  if (!content) return res.status(400).json({ error: 'Task content required' });

  try {
    const newTask = new Task({
      userId: req.user.userId,
      content,
      dueDate,
      repeat,
      goalId: goalId || null,
      entryId: entryId || null,
      clusters: clusters || [],
      addedToToday: addedToToday || [],
      completed: false
    });
    await newTask.save();
    res.json(newTask);
  } catch {
    res.status(500).json({ error: 'Failed to create task' });
  }
});

// PUT /api/tasks/:id
router.put('/:id', async (req, res) => {
  const {
    content,
    completed,
    dueDate,
    clusters,
    repeat,
    addedToToday
  } = req.body;

  try {
    const updated = await Task.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.userId },
      {
        content,
        completed,
        dueDate,
        clusters: clusters || [],
        repeat,
        addedToToday: addedToToday || [],
      },
      { new: true }
    );
    res.json(updated);
  } catch {
    res.status(500).json({ error: 'Failed to update task' });
  }
});

// DELETE /api/tasks/:id
router.delete('/:id', async (req, res) => {
  try {
    const deleted = await Task.findOneAndDelete({
      _id: req.params.id,
      userId: req.user.userId
    });
    if (!deleted) return res.status(404).json({ error: 'Task not found' });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

export default router;
