import express from 'express';
import mongoose from 'mongoose';
import Entry from '../models/Entry.js';
import GatherItem from '../models/GatherItem.js';
import SuggestedGatherItem from '../models/SuggestedGatherItem.js';
import { normalizeClusterIds, resolveClusterIdForOwner } from '../utils/clusterIds.js';
import { normalizeGatherTitleKey } from '../utils/gatherExtractor.js';

const router = express.Router();
const { ObjectId } = mongoose.Types;

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

    const items = await SuggestedGatherItem.find(q)
      .sort({ createdAt: -1 })
      .populate('clusters', 'name slug icon color')
      .populate('sourceEntryId', 'date title')
      .lean();
    res.json(items);
  } catch (err) {
    console.error('[suggested-gather-items] list failed:', err);
    res.status(500).json({ error: 'Failed to load suggested gather items' });
  }
});

router.put('/:id/accept', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: 'Invalid id' });

    const suggestion = await SuggestedGatherItem.findOne({ _id: req.params.id, userId, status: 'pending' });
    if (!suggestion) return res.status(404).json({ error: 'Suggested gather item not found' });

    const clusters = await resolveClusters(userId, req.body || {}, suggestion.clusters);
    const title = cleanString(req.body?.title, suggestion.title) || suggestion.title;
    const item = await GatherItem.create({
      userId,
      title,
      normalizedTitle: normalizeGatherTitleKey(title),
      description: cleanString(req.body?.description, suggestion.description || ''),
      clusters,
      list: cleanString(req.body?.list, suggestion.list) || suggestion.list || 'Things to Buy',
      status: 'needed',
      sourceEntryId: suggestion.sourceEntryId,
      sourceText: suggestion.sourceText || '',
      tags: Array.isArray(req.body?.tags) ? req.body.tags : suggestion.tags || [],
    });

    suggestion.status = 'accepted';
    await suggestion.save();
    await item.populate('clusters', 'name slug icon color');

    res.json({ suggestedGatherItem: suggestion, gatherItem: item });
  } catch (err) {
    console.error('[suggested-gather-items] accept failed:', err);
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
    console.error('[suggested-gather-items] reject failed:', err);
    res.status(500).json({ error: 'Failed to reject suggested gather item' });
  }
});

export default router;
