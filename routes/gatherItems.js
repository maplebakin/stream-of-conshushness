import express from 'express';
import mongoose from 'mongoose';
import GatherItem from '../models/GatherItem.js';
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

function normalizeStatus(value, fallback = 'needed') {
  const status = cleanString(value);
  return ['needed', 'found', 'bought', 'dismissed'].includes(status) ? status : fallback;
}

async function resolveClusters(userId, body = {}) {
  let clusters = await resolveClusterIdsForOwner(userId, body.clusters);
  if (!clusters.length && body.clusterId) {
    const resolved = await resolveClusterIdForOwner(userId, body.clusterId);
    if (resolved) clusters = [resolved];
  } else if (!clusters.length && body.cluster) {
    const resolved = await resolveClusterIdForOwner(userId, body.cluster);
    if (resolved) clusters = [resolved];
  }
  return clusters;
}

router.get('/', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const q = { userId };
    if (req.query.status) q.status = String(req.query.status);
    if (req.query.list) q.list = String(req.query.list);
    if (req.query.sourceEntryId && ObjectId.isValid(req.query.sourceEntryId)) {
      q.sourceEntryId = new ObjectId(req.query.sourceEntryId);
    }
    if (req.query.clusterId || req.query.cluster) {
      const resolved = await resolveClusterIdForOwner(userId, req.query.clusterId || req.query.cluster);
      if (!resolved) return res.json([]);
      q.clusters = resolved;
    }

    const items = await GatherItem.find(q)
      .sort({ status: 1, updatedAt: -1, createdAt: -1 })
      .populate({ path: 'clusters', select: 'name slug icon color', match: { ownerId: userId } })
      .lean();
    res.json(items);
  } catch (err) {
    logSafeError('gather items list failed', err);
    res.status(500).json({ error: 'Failed to load gather items' });
  }
});

router.post('/', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const title = cleanString(req.body?.title);
    if (!title) return res.status(400).json({ error: 'title is required' });

    const clusters = await resolveClusters(userId, req.body || {});
    const sourceEntryId = req.body?.sourceEntryId
      ? await resolveOwnedEntryId(userId, req.body.sourceEntryId)
      : null;
    if (req.body?.sourceEntryId && !sourceEntryId) {
      return res.status(400).json({ error: 'sourceEntryId must reference one of your entries' });
    }

    const item = await GatherItem.create({
      userId,
      title,
      normalizedTitle: normalizeGatherTitleKey(title),
      description: cleanString(req.body?.description),
      clusters,
      list: cleanString(req.body?.list, 'Things to Buy') || 'Things to Buy',
      status: normalizeStatus(req.body?.status),
      sourceEntryId,
      sourceText: cleanString(req.body?.sourceText),
      tags: Array.isArray(req.body?.tags) ? req.body.tags.filter((tag) => typeof tag === 'string' && tag.trim()) : [],
    });

    await item.populate({ path: 'clusters', select: 'name slug icon color', match: { ownerId: userId } });
    res.status(201).json(item);
  } catch (err) {
    logSafeError('gather items create failed', err);
    res.status(500).json({ error: 'Failed to create gather item' });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: 'Invalid id' });

    const item = await GatherItem.findOne({ _id: req.params.id, userId });
    if (!item) return res.status(404).json({ error: 'Gather item not found' });

    if (req.body?.title !== undefined) {
      const title = cleanString(req.body.title);
      if (!title) return res.status(400).json({ error: 'title is required' });
      item.title = title;
      item.normalizedTitle = normalizeGatherTitleKey(title);
    }
    if (req.body?.description !== undefined) item.description = cleanString(req.body.description);
    if (req.body?.list !== undefined) item.list = cleanString(req.body.list, 'Things to Buy') || 'Things to Buy';
    if (req.body?.status !== undefined) item.status = normalizeStatus(req.body.status, item.status);
    if (req.body?.sourceText !== undefined) item.sourceText = cleanString(req.body.sourceText);
    if (req.body?.tags !== undefined) {
      item.tags = Array.isArray(req.body.tags) ? req.body.tags.filter((tag) => typeof tag === 'string' && tag.trim()) : [];
    }
    if (req.body?.clusters !== undefined || req.body?.clusterId !== undefined || req.body?.cluster !== undefined) {
      item.clusters = await resolveClusters(userId, req.body || {});
    }

    const saved = await item.save();
    await saved.populate({ path: 'clusters', select: 'name slug icon color', match: { ownerId: userId } });
    res.json(saved);
  } catch (err) {
    logSafeError('gather items update failed', err);
    res.status(500).json({ error: 'Failed to update gather item' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: 'Invalid id' });

    const result = await GatherItem.deleteOne({ _id: req.params.id, userId });
    if (!result.deletedCount) return res.status(404).json({ error: 'Gather item not found' });
    res.json({ ok: true });
  } catch (err) {
    logSafeError('gather items delete failed', err);
    res.status(500).json({ error: 'Failed to delete gather item' });
  }
});

export default router;
