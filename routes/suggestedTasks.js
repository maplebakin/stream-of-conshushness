// routes/suggestedTasks.js
import express from 'express';
import mongoose from 'mongoose';
import SuggestedTask from '../models/SuggestedTask.js';
import Task from '../models/Task.js';
import auth from '../middleware/auth.js';
import { resolveClusterIdForOwner } from '../utils/clusterIds.js';

const router = express.Router();
const { ObjectId } = mongoose.Types;
router.use(auth);

const isYMD = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
const toDateString = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (isYMD(value)) return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
};
const priorityToNumber = (raw) => {
  const map = { high: 2, medium: 1, low: 0 };
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  return map[String(raw || '').toLowerCase()] ?? 0;
};

/* GET /api/suggested-tasks?status=pending */
router.get('/', async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const status = req.query.status || 'pending';
    const list = await SuggestedTask.find({ userId, status }).sort({ createdAt: -1 });
    res.json(list);
  } catch (err) {
    console.error('[suggested-tasks] list failed:', err);
    res.status(500).json({ error: 'Failed to load suggested tasks' });
  }
});

/* PUT /api/suggested-tasks/:id/accept */
router.put('/:id/accept', async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
    const sug = await SuggestedTask.findOne({ _id: req.params.id, userId, status: 'pending' });
    if (!sug) return res.status(404).end();

    const dueDate = toDateString(req.body?.dueDate) || toDateString(sug.dueDate);
    const clusterInput = req.body?.clusterId || req.body?.cluster || sug.cluster;
    const resolvedClusterId = clusterInput ? await resolveClusterIdForOwner(userId, clusterInput) : null;
    const clusters = resolvedClusterId ? [resolvedClusterId] : [];
    const section = req.body?.section || sug.section;
    const sections = section ? [String(section)] : [];
    const priority = priorityToNumber(req.body?.priority ?? sug.priority);
    const notes = typeof req.body?.notes === 'string' ? req.body.notes : '';

    const task = await Task.create({
      userId,
      title: sug.title,
      notes,
      dueDate,
      priority,
      clusters,
      sections,
      rrule: '',
      completed: false,
      status: 'todo',
    });

    sug.status = 'accepted';
    await sug.save();
    res.json({ suggestedTask: sug, task });
  } catch (err) {
    console.error('[suggested-tasks] accept failed:', err);
    res.status(500).json({ error: 'Failed to accept suggested task' });
  }
});

/* PUT /api/suggested-tasks/:id/reject */
router.put('/:id/reject', async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
    const sug = await SuggestedTask.findOneAndUpdate(
      { _id: req.params.id, userId, status: 'pending' },
      { status: 'rejected' },
      { new: true }
    );
    if (!sug) return res.status(404).json({ error: 'Suggested task not found' });
    res.json(sug);
  } catch (err) {
    console.error('[suggested-tasks] reject failed:', err);
    res.status(500).json({ error: 'Failed to reject suggested task' });
  }
});

export default router;
