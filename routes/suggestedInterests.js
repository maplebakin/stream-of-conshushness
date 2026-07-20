import express from 'express';
import mongoose from 'mongoose';
import Entry from '../models/Entry.js';
import Interest from '../models/Interest.js';
import SuggestedInterest from '../models/SuggestedInterest.js';
import { resolveClusterIdForOwner, resolveClusterIdsForOwner } from '../utils/clusterIds.js';
import { normalizeInterestTitleKey } from '../utils/interestExtractor.js';
import { logSafeError } from '../utils/errorHandler.js';
import { resolveOwnedEntryId } from '../utils/ownedReferences.js';

const router = express.Router();
const { ObjectId } = mongoose.Types;

const ACCEPTED_STATUSES = ['curious', 'exploring', 'active', 'paused', 'archived'];

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

async function createInterestForSuggestion(payload, suggestionId) {
  try {
    return await Interest.create({ ...payload, sourceSuggestionId: suggestionId });
  } catch (error) {
    if (error?.code !== 11000) throw error;
    const existing = await Interest.findOne({ userId: payload.userId, sourceSuggestionId: suggestionId });
    if (existing) return existing;
    throw error;
  }
}

async function loadAcceptableSuggestion(id, userId) {
  for (const status of ['pending', 'accepting', 'accepted']) {
    const suggestion = await SuggestedInterest.findOne({ _id: id, userId, status });
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

function normalizeAcceptedStatus(value) {
  const status = cleanString(value);
  return ACCEPTED_STATUSES.includes(status) ? status : 'curious';
}

function cleanTags(value, fallback = []) {
  if (Array.isArray(value)) return value.filter((tag) => typeof tag === 'string' && tag.trim());
  return Array.isArray(fallback) ? fallback : [];
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

    const items = await SuggestedInterest.find(q)
      .sort({ createdAt: -1 })
      .populate({ path: 'clusters', select: 'name slug icon color', match: { ownerId: userId } })
      .populate({ path: 'sourceEntryId', select: 'date title', match: { userId } })
      .lean();
    res.json(items);
  } catch (err) {
    logSafeError('suggested interests list failed', err);
    res.status(500).json({ error: 'Failed to load suggested interests' });
  }
});

router.put('/:id/accept', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: 'Invalid id' });

    const suggestion = await loadAcceptableSuggestion(req.params.id, userId);
    if (!suggestion) return res.status(404).json({ error: 'Suggested interest not found' });
    const wasAlreadyAccepted = suggestion.status === 'accepted';
    if (wasAlreadyAccepted || suggestion.status === 'accepting') {
      const existingInterest = await Interest.findOne({ userId, sourceSuggestionId: suggestion._id });
      if (existingInterest) {
        if (suggestion.status === 'accepting') {
          await SuggestedInterest.findOneAndUpdate(
            { _id: suggestion._id, userId, status: 'accepting' },
            { $set: { status: 'accepted' }, $unset: { acceptanceStartedAt: 1 } },
            { new: true }
          );
        }
        await existingInterest.populate({ path: 'clusters', select: 'name slug icon color', match: { ownerId: userId } });
        return res.json({
          suggestedInterest: suggestionWithStatus(suggestion, 'accepted'),
          interest: existingInterest,
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
    const title = cleanString(editBody.title, suggestion.title) || suggestion.title;
    const clusters = await resolveClusters(userId, editBody, suggestion.clusters);
    const proposedPayload = {
      userId,
      title,
      normalizedTitle: normalizeInterestTitleKey(title),
      description: cleanString(editBody.description, suggestion.description || ''),
      category: cleanString(editBody.category, suggestion.category) || suggestion.category || 'Learning Curiosities',
      status: normalizeAcceptedStatus(editBody.status),
      sourceEntryId,
      sourceText: suggestion.sourceText || '',
      clusters,
      cluster: cleanString(editBody.cluster, suggestion.cluster || ''),
      tags: cleanTags(editBody.tags, suggestion.tags || []),
      confidence: Number.isFinite(Number(suggestion.confidence)) ? Number(suggestion.confidence) : 0.7,
      reason: suggestion.reason || 'interestPhrase',
    };

    let activeSuggestion = suggestion;
    if (suggestion.status === 'pending') {
      activeSuggestion = await SuggestedInterest.findOneAndUpdate(
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

    let interest = await Interest.findOne({ userId, sourceSuggestionId: activeSuggestion._id });
    if (!interest) {
      interest = await createInterestForSuggestion(
        activeSuggestion.acceptancePayload || proposedPayload,
        activeSuggestion._id
      );
    }

    const finalizedSuggestion = activeSuggestion.status === 'accepted'
      ? activeSuggestion
      : await SuggestedInterest.findOneAndUpdate(
        { _id: activeSuggestion._id, userId, status: 'accepting' },
        { $set: { status: 'accepted' }, $unset: { acceptanceStartedAt: 1 } },
        { new: true }
      );
    await interest.populate({ path: 'clusters', select: 'name slug icon color', match: { ownerId: userId } });

    res.json({
      suggestedInterest: suggestionWithStatus(finalizedSuggestion || activeSuggestion, 'accepted'),
      interest,
    });
  } catch (err) {
    logSafeError('suggested interests accept failed', err);
    res.status(500).json({ error: 'Failed to accept suggested interest' });
  }
});

router.put('/:id/reject', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: 'Invalid id' });

    const suggestion = await SuggestedInterest.findOneAndUpdate(
      { _id: req.params.id, userId, status: 'pending' },
      { status: 'rejected' },
      { new: true }
    );
    if (!suggestion) return res.status(404).json({ error: 'Suggested interest not found' });
    res.json(suggestion);
  } catch (err) {
    logSafeError('suggested interests reject failed', err);
    res.status(500).json({ error: 'Failed to reject suggested interest' });
  }
});

export default router;
