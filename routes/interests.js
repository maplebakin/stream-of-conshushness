import express from 'express';
import mongoose from 'mongoose';
import Interest from '../models/Interest.js';
import { normalizeClusterIds, resolveClusterIdForOwner } from '../utils/clusterIds.js';
import { normalizeInterestTitleKey } from '../utils/interestExtractor.js';

const router = express.Router();
const { ObjectId } = mongoose.Types;

const INTEREST_STATUSES = ['curious', 'exploring', 'active', 'paused', 'archived'];

function getUserId(req) {
  return req.user?.userId || req.user?._id || req.user?.id || null;
}

function cleanString(value, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback;
}

function normalizeStatus(value, fallback = 'curious') {
  const status = cleanString(value);
  return INTEREST_STATUSES.includes(status) ? status : fallback;
}

async function resolveClusters(userId, body = {}) {
  let clusters = normalizeClusterIds(body.clusters);
  if (!clusters.length && body.clusterId) {
    const resolved = await resolveClusterIdForOwner(userId, body.clusterId);
    if (resolved) clusters = [resolved];
  } else if (!clusters.length && body.cluster) {
    const resolved = await resolveClusterIdForOwner(userId, body.cluster);
    if (resolved) clusters = [resolved];
  }
  return clusters;
}

function cleanTags(value) {
  return Array.isArray(value) ? value.filter((tag) => typeof tag === 'string' && tag.trim()) : [];
}

router.get('/', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const q = { userId };
    if (req.query.status) q.status = String(req.query.status);
    if (req.query.category) q.category = String(req.query.category);
    if (req.query.sourceEntryId && ObjectId.isValid(req.query.sourceEntryId)) {
      q.sourceEntryId = new ObjectId(req.query.sourceEntryId);
    }
    if (req.query.clusterId || req.query.cluster) {
      const resolved = await resolveClusterIdForOwner(userId, req.query.clusterId || req.query.cluster);
      if (!resolved) return res.json([]);
      q.clusters = resolved;
    }

    const items = await Interest.find(q)
      .sort({ status: 1, category: 1, updatedAt: -1, createdAt: -1 })
      .populate('clusters', 'name slug icon color')
      .lean();
    res.json(items);
  } catch (err) {
    console.error('[interests] list failed:', err);
    res.status(500).json({ error: 'Failed to load interests' });
  }
});

router.post('/', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const title = cleanString(req.body?.title);
    if (!title) return res.status(400).json({ error: 'title is required' });

    const clusters = await resolveClusters(userId, req.body || {});
    const sourceEntryId = ObjectId.isValid(req.body?.sourceEntryId) ? new ObjectId(req.body.sourceEntryId) : null;
    const item = await Interest.create({
      userId,
      title,
      normalizedTitle: normalizeInterestTitleKey(title),
      description: cleanString(req.body?.description),
      category: cleanString(req.body?.category, 'Learning Curiosities') || 'Learning Curiosities',
      status: normalizeStatus(req.body?.status),
      sourceEntryId,
      sourceText: cleanString(req.body?.sourceText),
      clusters,
      cluster: cleanString(req.body?.cluster),
      tags: cleanTags(req.body?.tags),
      confidence: Number.isFinite(Number(req.body?.confidence)) ? Number(req.body.confidence) : 0.7,
      reason: cleanString(req.body?.reason, 'manual') || 'manual',
    });

    await item.populate('clusters', 'name slug icon color');
    res.status(201).json(item);
  } catch (err) {
    console.error('[interests] create failed:', err);
    res.status(500).json({ error: 'Failed to create interest' });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: 'Invalid id' });

    const item = await Interest.findOne({ _id: req.params.id, userId });
    if (!item) return res.status(404).json({ error: 'Interest not found' });

    if (req.body?.title !== undefined) {
      const title = cleanString(req.body.title);
      if (!title) return res.status(400).json({ error: 'title is required' });
      item.title = title;
      item.normalizedTitle = normalizeInterestTitleKey(title);
    }
    if (req.body?.description !== undefined) item.description = cleanString(req.body.description);
    if (req.body?.category !== undefined) item.category = cleanString(req.body.category, item.category) || item.category;
    if (req.body?.status !== undefined) item.status = normalizeStatus(req.body.status, item.status);
    if (req.body?.sourceText !== undefined) item.sourceText = cleanString(req.body.sourceText);
    if (req.body?.cluster !== undefined) item.cluster = cleanString(req.body.cluster);
    if (req.body?.tags !== undefined) item.tags = cleanTags(req.body.tags);
    if (req.body?.clusters !== undefined || req.body?.clusterId !== undefined || req.body?.cluster !== undefined) {
      item.clusters = await resolveClusters(userId, req.body || {});
    }

    const saved = await item.save();
    await saved.populate('clusters', 'name slug icon color');
    res.json(saved);
  } catch (err) {
    console.error('[interests] update failed:', err);
    res.status(500).json({ error: 'Failed to update interest' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: 'Invalid id' });

    const result = await Interest.deleteOne({ _id: req.params.id, userId });
    if (!result.deletedCount) return res.status(404).json({ error: 'Interest not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('[interests] delete failed:', err);
    res.status(500).json({ error: 'Failed to delete interest' });
  }
});

export default router;
