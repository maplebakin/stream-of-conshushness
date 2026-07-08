// routes/suggestedTasks.js
import express from 'express';
import mongoose from 'mongoose';
import SuggestedTask from '../models/SuggestedTask.js';
import Task from '../models/Task.js';
import Ripple from '../models/Ripple.js';
import { resolveClusterIdForOwner } from '../utils/clusterIds.js';

const router = express.Router();
const { ObjectId } = mongoose.Types;

const datePrefix = (value) => (
  typeof value === 'string'
    ? value.trim().match(/^(\d{4}-\d{2}-\d{2})(?:$|[T\s])/)
    : null
);
const formatUTCDate = (date) => (
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
);
const toDateString = (value) => {
  if (!value) return null;
  const explicitDate = datePrefix(value);
  if (explicitDate) return explicitDate[1];
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : formatUTCDate(value);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return formatUTCDate(parsed);
};
const normalizeTitleKey = (value) => String(value || '').trim().toLowerCase();
const priorityToNumber = (raw) => {
  const map = { high: 2, medium: 1, low: 0 };
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  return map[String(raw || '').toLowerCase()] ?? 0;
};

function withPopulateSourceRipple(query) {
  return query.populate('sourceRippleId', 'dateKey entryId text');
}

async function loadSuggestedTasks(query) {
  const result = withPopulateSourceRipple(SuggestedTask.find(query)).sort({ createdAt: -1 });
  if (result?.lean) return result.lean();
  return result;
}

/* GET /api/suggested-tasks?status=pending&date=YYYY-MM-DD */
router.get('/', async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const status = req.query.status || 'pending';
    const date = toDateString(req.query.date);
    let list = await loadSuggestedTasks({ userId, status });
    if (date) {
      list = list.filter((item) => item?.sourceRippleId?.dateKey === date);
    }
    res.json(list);
  } catch (err) {
    console.error('[suggested-tasks] list failed:', err);
    res.status(500).json({ error: 'Failed to load suggested tasks' });
  }
});

async function acceptDuplicatePendingSuggestions({ userId, acceptedSuggestion, sourceRipple }) {
  if (!userId || !acceptedSuggestion?.sourceRippleId || !sourceRipple?.entryId) return;
  const titleKey = normalizeTitleKey(acceptedSuggestion.title);
  if (!titleKey) return;

  const duplicateRippleQuery = {
    userId,
    entryId: sourceRipple.entryId,
    text: acceptedSuggestion.title,
    status: 'pending',
    _id: { $ne: acceptedSuggestion.sourceRippleId },
  };
  if (sourceRipple.dateKey) duplicateRippleQuery.dateKey = sourceRipple.dateKey;

  const duplicateRipples = await Ripple.find(duplicateRippleQuery).select('_id').lean();

  const duplicateRippleIds = duplicateRipples.map((ripple) => ripple._id);
  if (!duplicateRippleIds.length) return;

  await SuggestedTask.updateMany(
    {
      userId,
      sourceRippleId: { $in: duplicateRippleIds },
      status: 'pending',
      title: acceptedSuggestion.title,
    },
    { $set: { status: 'accepted' } }
  );

  await Ripple.updateMany(
    { _id: { $in: duplicateRippleIds }, userId, status: 'pending' },
    { $set: { status: 'applied' } }
  );
}

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
    const title = typeof req.body?.title === 'string' && req.body.title.trim()
      ? req.body.title.trim().slice(0, 200)
      : sug.title;
    const section = req.body?.section || sug.section;
    const sections = section ? [String(section)] : [];
    const priority = priorityToNumber(req.body?.priority ?? sug.priority);
    const notes = typeof req.body?.notes === 'string' ? req.body.notes : '';
    const sourceRipple = await Ripple.findOne({ _id: sug.sourceRippleId, userId }).select('entryId dateKey').lean();

    const task = await Task.create({
      userId,
      title,
      priority,
      dueDate,
      rrule: sug.repeat || sug.rrule || '',
      clusters,
      ...(sections.length ? { sections } : {}),
      ...(notes ? { notes } : {}),
      ...(sourceRipple?.entryId ? { entryId: sourceRipple.entryId } : {}),
    });

    sug.status = 'accepted';
    await sug.save();

    if (sug.sourceRippleId) {
      await Ripple.findOneAndUpdate(
        { _id: sug.sourceRippleId, userId },
        { $set: { status: 'applied' } }
      );
    }

    await acceptDuplicatePendingSuggestions({ userId, acceptedSuggestion: sug, sourceRipple });

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

    if (sug.sourceRippleId) {
      await Ripple.findOneAndUpdate(
        { _id: sug.sourceRippleId, userId },
        { $set: { status: 'dismissed' } }
      );
    }

    res.json(sug);
  } catch (err) {
    console.error('[suggested-tasks] reject failed:', err);
    res.status(500).json({ error: 'Failed to reject suggested task' });
  }
});

export default router;
