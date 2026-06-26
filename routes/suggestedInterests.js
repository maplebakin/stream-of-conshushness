import express from 'express';
import mongoose from 'mongoose';
import Entry from '../models/Entry.js';
import Interest from '../models/Interest.js';
import SuggestedInterest from '../models/SuggestedInterest.js';
import { normalizeClusterIds, resolveClusterIdForOwner } from '../utils/clusterIds.js';
import { normalizeInterestTitleKey } from '../utils/interestExtractor.js';

const router = express.Router();
const { ObjectId } = mongoose.Types;

const ACCEPTED_STATUSES = ['curious', 'exploring', 'active', 'paused', 'archived'];

function getUserId(req) {
  return req.user?.userId || req.user?._id || req.user?.id || null;
}

function cleanString(value, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback;
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
  let clusters = normalizeClusterIds(body.clusters);
  if (!clusters.length && body.clusterId) {
    const resolved = await resolveClusterIdForOwner(userId, body.clusterId);
    if (resolved) clusters = [resolved];
  } else if (!clusters.length && body.cluster) {
    const resolved = await resolveClusterIdForOwner(userId, body.cluster);
    if (resolved) clusters = [resolved];
  }
  return clusters.length ? clusters : normalizeClusterIds(fallback);
}

router.get('/', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const status = req.query.status || 'pending';
    const q = { userId };
    if (status !== 'all') q.status = String(status);
    if (req.query.sourceEntryId && ObjectId.isValid(req.query.sourceEntryId)) {
      q.sourceEntryId = new ObjectId(req.query.sourceEntryId);
    }
    const dateError = await applyEntryDateFilter(q, userId, req.query.date);
    if (dateError) return res.status(400).json({ error: dateError });

    const items = await SuggestedInterest.find(q)
      .sort({ createdAt: -1 })
      .populate('clusters', 'name slug icon color')
      .populate('sourceEntryId', 'date title')
      .lean();
    res.json(items);
  } catch (err) {
    console.error('[suggested-interests] list failed:', err);
    res.status(500).json({ error: 'Failed to load suggested interests' });
  }
});

router.put('/:id/accept', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: 'Invalid id' });

    const suggestion = await SuggestedInterest.findOne({ _id: req.params.id, userId, status: 'pending' });
    if (!suggestion) return res.status(404).json({ error: 'Suggested interest not found' });

    const title = cleanString(req.body?.title, suggestion.title) || suggestion.title;
    const clusters = await resolveClusters(userId, req.body || {}, suggestion.clusters);
    const interest = await Interest.create({
      userId,
      title,
      normalizedTitle: normalizeInterestTitleKey(title),
      description: cleanString(req.body?.description, suggestion.description || ''),
      category: cleanString(req.body?.category, suggestion.category) || suggestion.category || 'Learning Curiosities',
      status: normalizeAcceptedStatus(req.body?.status),
      sourceEntryId: suggestion.sourceEntryId,
      sourceText: suggestion.sourceText || '',
      clusters,
      cluster: cleanString(req.body?.cluster, suggestion.cluster || ''),
      tags: cleanTags(req.body?.tags, suggestion.tags || []),
      confidence: Number.isFinite(Number(suggestion.confidence)) ? Number(suggestion.confidence) : 0.7,
      reason: suggestion.reason || 'interestPhrase',
    });

    suggestion.status = 'accepted';
    await suggestion.save();
    await interest.populate('clusters', 'name slug icon color');

    res.json({ suggestedInterest: suggestion, interest });
  } catch (err) {
    console.error('[suggested-interests] accept failed:', err);
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
    console.error('[suggested-interests] reject failed:', err);
    res.status(500).json({ error: 'Failed to reject suggested interest' });
  }
});

export default router;
