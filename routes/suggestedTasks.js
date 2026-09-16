// routes/suggestedTasks.js
import express from 'express';
import mongoose from 'mongoose';
import SuggestedTask from '../models/SuggestedTask.js';
import Task from '../models/Task.js';
import Ripple from '../models/Ripple.js';
import { resolveClusterIdForOwner } from '../utils/clusterIds.js';
import { logSafeError } from '../utils/errorHandler.js';
import { isValidISODate, recurrenceValidationError } from '../utils/recurrence.js';
import { resolveOwnedEntryId } from '../utils/ownedReferences.js';

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
  if (explicitDate) return isValidISODate(explicitDate[1]) ? explicitDate[1] : null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : formatUTCDate(value);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return formatUTCDate(parsed);
};
const normalizeTitleKey = (value) => String(value || '').trim().toLowerCase();
const normalizeSuggestedRRule = (value) => {
  const raw = String(value || '').trim();
  const legacyFrequency = raw.toUpperCase();
  if (['DAILY', 'WEEKLY', 'MONTHLY'].includes(legacyFrequency)) {
    return `FREQ=${legacyFrequency}`;
  }
  return raw;
};
const suggestionWithStatus = (suggestion, status) => {
  const plain = {
    ...(typeof suggestion?.toObject === 'function' ? suggestion.toObject() : suggestion || {}),
    status,
  };
  delete plain.acceptancePayload;
  delete plain.acceptanceStartedAt;
  return plain;
};
const priorityToNumber = (raw) => {
  const map = { high: 2, medium: 1, low: 0 };
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  return map[String(raw || '').toLowerCase()] ?? 0;
};

async function createTaskForSuggestion(payload, suggestionId) {
  try {
    return await Task.create({ ...payload, sourceSuggestionId: suggestionId });
  } catch (error) {
    if (error?.code !== 11000) throw error;
    const existing = await Task.findOne({ userId: payload.userId, sourceSuggestionId: suggestionId });
    if (existing) return existing;
    throw error;
  }
}

async function loadAcceptableSuggestion(id, userId) {
  for (const status of ['pending', 'accepting', 'accepted']) {
    const suggestion = await SuggestedTask.findOne({ _id: id, userId, status });
    if (suggestion) return suggestion;
  }
  return null;
}

const pendingReviewStatus = () => ({ $in: ['pending', 'accepting', 'rejecting'] });

function withPopulateSourceRipple(query, userId) {
  return query.populate({
    path: 'sourceRippleId',
    select: 'dateKey entryId text',
    match: { userId },
  });
}

async function loadSuggestedTasks(query) {
  const result = withPopulateSourceRipple(SuggestedTask.find(query), query.userId).sort({ createdAt: -1 });
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
    let list = await loadSuggestedTasks({
      userId,
      status: status === 'pending' ? pendingReviewStatus() : status,
    });
    if (date) {
      list = list.filter((item) => item?.sourceRippleId?.dateKey === date);
    }
    res.json(list);
  } catch (err) {
    logSafeError('suggested tasks list failed', err);
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
    { $set: { status: 'superseded' } }
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
    const sug = await loadAcceptableSuggestion(req.params.id, userId);
    if (!sug) return res.status(404).end();
    const wasAlreadyAccepted = sug.status === 'accepted';

    // Completed and in-flight retries must never apply a later request body's
    // edits. The first atomic pending -> accepting transition owns the payload.
    if (wasAlreadyAccepted || sug.status === 'accepting') {
      const existingTask = await Task.findOne({ userId, sourceSuggestionId: sug._id });
      if (existingTask) {
        if (sug.status === 'accepting') {
          await SuggestedTask.findOneAndUpdate(
            { _id: sug._id, userId, status: 'accepting' },
            { $set: { status: 'accepted' }, $unset: { acceptanceStartedAt: 1 } },
            { new: true }
          );
        }
        if (sug.sourceRippleId) {
          await Ripple.findOneAndUpdate(
            { _id: sug.sourceRippleId, userId },
            { $set: { status: 'applied' } }
          );
        }
        return res.json({ suggestedTask: suggestionWithStatus(sug, 'accepted'), task: existingTask });
      }
    }

    const allowEdits = sug.status === 'pending';
    const hasRequestedDueDate = allowEdits
      && Object.prototype.hasOwnProperty.call(req.body || {}, 'dueDate');
    const requestedDueDate = toDateString(req.body?.dueDate);
    if (hasRequestedDueDate && req.body?.dueDate && !requestedDueDate) {
      return res.status(400).json({ error: 'dueDate must be YYYY-MM-DD' });
    }
    const dueDate = hasRequestedDueDate ? requestedDueDate : toDateString(sug.dueDate);
    const clusterInput = allowEdits
      ? (req.body?.clusterId || req.body?.cluster || sug.cluster)
      : sug.cluster;
    const resolvedClusterId = clusterInput ? await resolveClusterIdForOwner(userId, clusterInput) : null;
    const clusters = resolvedClusterId ? [resolvedClusterId] : [];
    const title = allowEdits && typeof req.body?.title === 'string' && req.body.title.trim()
      ? req.body.title.trim().slice(0, 200)
      : sug.title;
    const section = (allowEdits ? req.body?.section : null) || sug.section;
    const sections = section ? [String(section)] : [];
    const priority = priorityToNumber(allowEdits ? (req.body?.priority ?? sug.priority) : sug.priority);
    const notes = allowEdits && typeof req.body?.notes === 'string' ? req.body.notes : '';
    const sourceRipple = sug.sourceRippleId
      ? await Ripple.findOne({ _id: sug.sourceRippleId, userId }).select('entryId dateKey').lean()
      : null;
    const requestedSourceEntryId = sug.sourceEntryId || sourceRipple?.entryId || null;
    const sourceEntryId = requestedSourceEntryId
      ? await resolveOwnedEntryId(userId, requestedSourceEntryId)
      : null;
    if (requestedSourceEntryId && !sourceEntryId) {
      return res.status(409).json({ error: 'Suggestion source entry is unavailable' });
    }

    const rrule = normalizeSuggestedRRule(sug.repeat || sug.rrule || '');
    const recurrenceError = recurrenceValidationError(rrule, dueDate || '');
    if (recurrenceError) return res.status(400).json({ error: recurrenceError });

    const proposedPayload = {
      userId,
      title,
      priority,
      dueDate,
      rrule,
      clusters,
      ...(sections.length ? { sections } : {}),
      ...(notes ? { notes } : {}),
      ...(sourceEntryId ? { entryId: sourceEntryId } : {}),
    };

    let activeSuggestion = sug;
    if (sug.status === 'pending') {
      activeSuggestion = await SuggestedTask.findOneAndUpdate(
        { _id: sug._id, userId, status: 'pending' },
        {
          $set: {
            status: 'accepting',
            acceptancePayload: proposedPayload,
            acceptanceStartedAt: new Date(),
            title,
          },
        },
        { new: true }
      );
      if (!activeSuggestion) activeSuggestion = await loadAcceptableSuggestion(sug._id, userId);
    }
    if (!activeSuggestion || !['accepting', 'accepted'].includes(activeSuggestion.status)) {
      return res.status(409).json({ error: 'Suggestion is no longer pending review' });
    }

    // A completed request may be retried after the response was lost, or after
    // only part of the three-record reconciliation succeeded. Prefer the
    // already-linked owned task, and rely on its unique provenance index to
    // settle concurrent pending acceptances on exactly one destination.
    let task = await Task.findOne({ userId, sourceSuggestionId: activeSuggestion._id });
    if (!task) {
      const payload = activeSuggestion.acceptancePayload || proposedPayload;
      task = await createTaskForSuggestion(payload, activeSuggestion._id);
    }

    const finalizedSuggestion = activeSuggestion.status === 'accepted'
      ? activeSuggestion
      : await SuggestedTask.findOneAndUpdate(
        { _id: activeSuggestion._id, userId, status: 'accepting' },
        { $set: { status: 'accepted' }, $unset: { acceptanceStartedAt: 1 } },
        { new: true }
      );

    if (sug.sourceRippleId) {
      await Ripple.findOneAndUpdate(
        { _id: sug.sourceRippleId, userId },
        { $set: { status: 'applied' } }
      );
    }

    await acceptDuplicatePendingSuggestions({
      userId,
      acceptedSuggestion: finalizedSuggestion || activeSuggestion,
      sourceRipple,
    });

    res.json({
      suggestedTask: suggestionWithStatus(finalizedSuggestion || activeSuggestion, 'accepted'),
      task,
    });
  } catch (err) {
    logSafeError('suggested tasks accept failed', err);
    res.status(500).json({ error: 'Failed to accept suggested task' });
  }
});

/* PUT /api/suggested-tasks/:id/reject */
router.put('/:id/reject', async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
    let sug = await SuggestedTask.findOneAndUpdate(
      { _id: req.params.id, userId, status: 'pending' },
      { $set: { status: 'rejecting', acceptanceStartedAt: new Date() } },
      { new: true }
    );
    if (!sug) {
      sug = await SuggestedTask.findOne({
        _id: req.params.id,
        userId,
        status: { $in: ['rejecting', 'rejected'] },
      });
    }
    if (!sug) return res.status(404).json({ error: 'Suggested task not found' });

    if (sug.sourceRippleId) {
      await Ripple.findOneAndUpdate(
        { _id: sug.sourceRippleId, userId },
        { $set: { status: 'dismissed' } }
      );
    }

    if (sug.status === 'rejecting') {
      sug = await SuggestedTask.findOneAndUpdate(
        { _id: sug._id, userId, status: 'rejecting' },
        { $set: { status: 'rejected' }, $unset: { acceptanceStartedAt: 1 } },
        { new: true }
      ) || suggestionWithStatus(sug, 'rejected');
    }

    res.json(sug);
  } catch (err) {
    logSafeError('suggested tasks reject failed', err);
    res.status(500).json({ error: 'Failed to reject suggested task' });
  }
});

export default router;
