import express from 'express';
import auth from '../middleware/auth.js';
import Task from '../models/Task.js';

const router = express.Router();

// GET all tasks for the logged-in user
router.get('/', auth, async (req, res) => {
  try {
    const tasks = await Task.find({ userId: req.user.userId }).sort({ dueDate: 1 });
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load tasks' });
  }
});

// POST new task
router.post('/', auth, async (req, res) => {
  try {
    const newTask = new Task({
      ...req.body,
      userId: req.user.userId,
      completed: false,
    });
    await newTask.save();
    res.status(201).json(newTask);
  } catch (err) {
    console.error('❌ Task creation error:', err);
    res.status(400).json({ error: 'Failed to create task' });
  }
});

// PATCH update
router.patch('/:id', auth, async (req, res) => {
  try {
    const updated = await Task.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.userId },
      req.body,
      { new: true }
    );
    if (!updated) return res.status(404).json({ error: 'Task not found' });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: 'Failed to update task' });
  }
});

// DELETE task
router.delete('/:id', auth, async (req, res) => {
  try {
    await Task.findOneAndDelete({ _id: req.params.id, userId: req.user.userId });
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: 'Failed to delete task' });
  }
});

// GET tasks for a specific date
router.get('/by-date/:date', auth, async (req, res) => {
  try {
    const { date } = req.params;
    const tasks = await Task.find({
      userId: req.user.userId,
      $or: [
        { dueDate: date },
        { entryDate: date } // in case we want to support this field
      ]
    }).sort({ createdAt: -1 });
    res.json(tasks);
  } catch (err) {
    console.error('❌ Error fetching tasks by date:', err);
    res.status(500).json({ error: 'Failed to fetch tasks for date' });
  }
});
// GET tasks linked to a specific entry
router.get('/by-entry/:entryId', auth, async (req, res) => {
  try {
    const { entryId } = req.params;
    const tasks = await Task.find({
      userId: req.user.userId,
      entryId: entryId
    }).sort({ createdAt: -1 });
    res.json(tasks);
  } catch (err) {
    console.error('❌ Error fetching tasks by entryId:', err);
    res.status(500).json({ error: 'Failed to fetch tasks for entry' });
  }
});
// GET tasks due on a specific date
router.get('/by-date/:date', auth, async (req, res) => {
  try {
    const { date } = req.params;

    // Convert to actual date object and build start/end of day
    const start = new Date(date);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);

    const tasks = await Task.find({
      userId: req.user.userId,
      dueDate: { $gte: start, $lte: end },
    }).sort({ createdAt: 1 });

    res.json(tasks);
  } catch (err) {
    console.error('❌ Failed to get tasks by date:', err);
    res.status(500).json({ error: 'Failed to get tasks by date' });
  }
});
// GET tasks by cluster
router.get('/by-cluster/:cluster', auth, async (req, res) => {
  try {
    const tasks = await Task.find({
      userId: req.user.userId,
      cluster: req.params.cluster
    }).sort({ dueDate: 1 });
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load tasks by cluster' });
  }
});

// GET tasks by date and/or cluster (query params)
router.get('/filter', auth, async (req, res) => {
  try {
    const { date, cluster } = req.query;
    const query = { userId: req.user.userId };

    if (date) {
      const start = new Date(date);
      const end = new Date(date);
      end.setDate(end.getDate() + 1);
      query.dueDate = { $gte: start, $lt: end };
    }

    if (cluster) {
      query.cluster = cluster;
    }

    const tasks = await Task.find(query).sort({ dueDate: 1 });
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ error: 'Failed to filter tasks' });
  }
});


export default router;
