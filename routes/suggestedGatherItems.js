import express from 'express';
import mongoose from 'mongoose';
import Entry from '../models/Entry.js';
import GatherItem from '../models/GatherItem.js';
import SuggestedGatherItem from '../models/SuggestedGatherItem.js';
import { resolveClusterIdForOwner, resolveClusterIdsForOwner } from '../utils/clusterIds.js';
import { normalizeGatherTitleKey } from '../utils/gatherExtractor.js';
import { logSafeError } from '../utils/errorHandler.js';
import { resolveOwnedEntryId } from '../utils/ownedReferences.js';

const router = express.Router();
const { ObjectId } = mongoose.Types;

function getUserId(req) {
  return req.user?.userId || req.user?._id || req.user?.id || null;
}

function cleanString(value, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback;
}

function suggestionWithStatus(suggestion, status) {
  const plain = {
    ...(typeof suggestion?.toObject === 'function' ? suggestion.toObject() : suggestion || {}),
    status,
  };
  delete plain.acceptancePayload;
  delete plain.acceptanceStartedAt;
  return plain;
}

async function createGatherItemForSuggestion(payload, suggestionId) {
  try {
    return await GatherItem.create({ ...payload, sourceSuggestionId: suggestionId });
  } catch (error) {
    if (error?.code !== 11000) throw error;
    const existing = await GatherItem.findOne({ userId: payload.userId, sourceSuggestionId: suggestionId });
    if (existing) return existing;
    throw error;
  }
}

async function loadAcceptableSuggestion(id, userId) {
  for (const status of ['pending', 'accepting', 'accepted']) {
    const suggestion = await SuggestedGatherItem.findOne({ _id: id, userId, status });
    if (suggestion) return suggestion;
  }
  return null;
}

function isDateKey(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

async function applyEntryDateFilter(query, userId, rawDate) {
  if (rawDate == null || rawDate === '') return null;
  const date = String(rawDate);
  if (!isDateKey(date)) return 'date must use YYYY-MM-DD format';

  const entries = await Entry.find({ userId, date }).select('_id').lean();
  const entryIds = entries.map((entry) => entry._id);

  if (query.sourceEntryId) {
    const requestedEntryId = String(query.sourceEntryId);
    const matchesDate = entryIds.some((entryId) => String(entryId) === requestedEntryId);
    query.sourceEntryId = matchesDate ? query.sourceEntryId : { $in: [] };
  } else {
    query.sourceEntryId = { $in: entryIds };
  }
  return null;
}

async function resolveClusters(userId, body = {}, fallback = []) {
  let clusters = await resolveClusterIdsForOwner(userId, body.clusters);
  if (!clusters.length && body.clusterId) {
    const resolved = await resolveClusterIdForOwner(userId, body.clusterId);
    if (resolved) clusters = [resolved];
  } else if (!clusters.length && body.cluster) {
    const resolved = await resolveClusterIdForOwner(userId, body.cluster);
    if (resolved) clusters = [resolved];
  }
  return clusters.length ? clusters : resolveClusterIdsForOwner(userId, fallback);
}

router.get('/', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const status = req.query.status || 'pending';
    const q = { userId };
    if (status !== 'all') {
      q.status = status === 'pending' ? { $in: ['pending', 'accepting'] } : String(status);
    }
    if (req.query.sourceEntryId && ObjectId.isValid(req.query.sourceEntryId)) {
      q.sourceEntryId = new ObjectId(req.query.sourceEntryId);
    }
    const dateError = await applyEntryDateFilter(q, userId, req.query.date);
    if (dateError) return res.status(400).json({ error: dateError });

    const items = await SuggestedGatherItem.find(q)
      .sort({ createdAt: -1 })
      .populate({ path: 'clusters', select: 'name slug icon color', match: { ownerId: userId } })
      .populate({ path: 'sourceEntryId', select: 'date title', match: { userId } })
      .lean();
    res.json(items);
  } catch (err) {
    logSafeError('suggested gather items list failed', err);
    res.status(500).json({ error: 'Failed to load suggested gather items' });
  }
});

router.put('/:id/accept', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: 'Invalid id' });

    const suggestion = await loadAcceptableSuggestion(req.params.id, userId);
    if (!suggestion) return res.status(404).json({ error: 'Suggested gather item not found' });
    const wasAlreadyAccepted = suggestion.status === 'accepted';
    if (wasAlreadyAccepted || suggestion.status === 'accepting') {
      const existingItem = await GatherItem.findOne({ userId, sourceSuggestionId: suggestion._id });
      if (existingItem) {
        if (suggestion.status === 'accepting') {
          await SuggestedGatherItem.findOneAndUpdate(
            { _id: suggestion._id, userId, status: 'accepting' },
            { $set: { status: 'accepted' }, $unset: { acceptanceStartedAt: 1 } },
            { new: true }
          );
        }
        await existingItem.populate({ path: 'clusters', select: 'name slug icon color', match: { ownerId: userId } });
        return res.json({
          suggestedGatherItem: suggestionWithStatus(suggestion, 'accepted'),
          gatherItem: existingItem,
        });
      }
    }
    const sourceEntryId = suggestion.sourceEntryId
      ? await resolveOwnedEntryId(userId, suggestion.sourceEntryId)
      : null;
    if (suggestion.sourceEntryId && !sourceEntryId) {
      return res.status(409).json({ error: 'Suggestion source entry is unavailable' });
    }

    const allowEdits = suggestion.status === 'pending';
    const editBody = allowEdits ? (req.body || {}) : {};
    const clusters = await resolveClusters(userId, editBody, suggestion.clusters);
    const title = cleanString(editBody.title, suggestion.title) || suggestion.title;
    const proposedPayload = {
      userId,
      title,
      normalizedTitle: normalizeGatherTitleKey(title),
      description: cleanString(editBody.description, suggestion.description || ''),
      clusters,
      list: cleanString(editBody.list, suggestion.list) || suggestion.list || 'Things to Buy',
      status: 'needed',
      sourceEntryId,
      sourceText: suggestion.sourceText || '',
      tags: Array.isArray(editBody.tags) ? editBody.tags : suggestion.tags || [],
    };

    let activeSuggestion = suggestion;
    if (suggestion.status === 'pending') {
      activeSuggestion = await SuggestedGatherItem.findOneAndUpdate(
        { _id: suggestion._id, userId, status: 'pending' },
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
      if (!activeSuggestion) activeSuggestion = await loadAcceptableSuggestion(suggestion._id, userId);
    }
    if (!activeSuggestion || !['accepting', 'accepted'].includes(activeSuggestion.status)) {
      return res.status(409).json({ error: 'Suggestion is no longer pending review' });
    }

    let item = await GatherItem.findOne({ userId, sourceSuggestionId: activeSuggestion._id });
    if (!item) {
      item = await createGatherItemForSuggestion(
        activeSuggestion.acceptancePayload || proposedPayload,
        activeSuggestion._id
      );
    }

    const finalizedSuggestion = activeSuggestion.status === 'accepted'
      ? activeSuggestion
      : await SuggestedGatherItem.findOneAndUpdate(
        { _id: activeSuggestion._id, userId, status: 'accepting' },
        { $set: { status: 'accepted' }, $unset: { acceptanceStartedAt: 1 } },
        { new: true }
      );
    await item.populate({ path: 'clusters', select: 'name slug icon color', match: { ownerId: userId } });

    res.json({
      suggestedGatherItem: suggestionWithStatus(finalizedSuggestion || activeSuggestion, 'accepted'),
      gatherItem: item,
    });
  } catch (err) {
    logSafeError('suggested gather items accept failed', err);
    res.status(500).json({ error: 'Failed to accept suggested gather item' });
  }
});

router.put('/:id/reject', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: 'Invalid id' });

    const suggestion = await SuggestedGatherItem.findOneAndUpdate(
      { _id: req.params.id, userId, status: 'pending' },
      { status: 'rejected' },
      { new: true }
    );
    if (!suggestion) return res.status(404).json({ error: 'Suggested gather item not found' });
    res.json(suggestion);
  } catch (err) {
    logSafeError('suggested gather items reject failed', err);
    res.status(500).json({ error: 'Failed to reject suggested gather item' });
  }
});

export default router;
