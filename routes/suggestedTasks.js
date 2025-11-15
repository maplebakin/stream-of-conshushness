// routes/suggestedTasks.js
import express from 'express';
import SuggestedTask from '../models/SuggestedTask.js';
import Task from '../models/Task.js';
import { resolveClusterIdForOwner } from '../utils/clusterIds.js';

const router = express.Router();

/* GET /api/suggested-tasks?status=pending */
router.get('/', async (req, res) => {
  const status = req.query.status || 'pending';
  const list = await SuggestedTask.find({ userId: req.user.userId, status }).sort({ createdAt:-1 });
  res.json(list);
});

/* PUT /api/suggested-tasks/:id/accept */
router.put('/:id/accept', async (req, res) => {
  const sug = await SuggestedTask.findOne({ _id:req.params.id, userId:req.user.userId, status:'pending' });
  if (!sug) return res.status(404).end();

  const normalizedDueDate = (() => {
    if (!sug.dueDate) return null;
    try {
      const date = new Date(sug.dueDate);
      if (Number.isNaN(date.getTime())) return null;
      return date.toISOString().slice(0, 10);
    } catch (err) {
      return null;
    }
  })();

  const priorityMap = { high: 2, medium: 1, low: 0 };
  const normalizedPriority = typeof sug.priority === 'string'
    ? priorityMap[sug.priority] ?? 0
    : typeof sug.priority === 'number'
      ? sug.priority
      : 0;

  let clusterIds = [];
  if (sug.cluster) {
    const resolved = await resolveClusterIdForOwner(sug.userId, sug.cluster);
    if (resolved) clusterIds = [resolved];
  }

  const task = await Task.create({
    userId : sug.userId,
    title  : sug.title,
    priority: normalizedPriority,
    dueDate: normalizedDueDate,
    rrule  : sug.repeat || '',
    clusters: clusterIds
  });

  sug.status = 'accepted';
  await sug.save();
  res.json({ suggestedTask:sug, task });
});

/* PUT /api/suggested-tasks/:id/reject */
router.put('/:id/reject', async (req, res) => {
  const sug = await SuggestedTask.findOneAndUpdate(
    { _id:req.params.id, userId:req.user.userId, status:'pending' },
    { status:'rejected' },
    { new:true }
  );
  if (!sug) return res.status(404).end();
  res.json(sug);
});

export default router;
