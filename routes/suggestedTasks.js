// routes/suggestedTasks.js
import express from 'express';
import SuggestedTask from '../models/SuggestedTask.js';
import Task from '../models/Task.js';

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

  const task = await Task.create({
    userId : sug.userId,
    title  : sug.title,
    priority:sug.priority,
    dueDate:sug.dueDate,
    repeat :sug.repeat,
    cluster:sug.cluster
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
