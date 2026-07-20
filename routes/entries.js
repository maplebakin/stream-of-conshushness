// routes/entries.js
// Solidified entries API with:
// - Toronto-safe date normalization
// - GET by ID and GET by date (moved to /by-date/:date to avoid id clash)
// - Query filtering (date, cluster, section, sectionPageId, limit)
// - NLP hooks for ImportantEvents/Appointments (non-fatal)

import express from "express";
import mongoose from "mongoose";
import Entry from "../models/Entry.js";
import {
  createEntryWithAutomation,
  updateEntryWithAutomation,
  getUserIdFromRequest,
} from "../utils/entryAutomation.js";
import { normalizeDate } from "../utils/date.js";
import { activeEntryQuery } from "../utils/entryQueries.js";
import { logSafeError } from "../utils/errorHandler.js";

const router = express.Router();

const { ObjectId } = mongoose.Types;
const CLIENT_REQUEST_ID_PATTERN = /^[a-z0-9][a-z0-9._:-]{7,127}$/i;

function entryError(res, error) {
  if (error instanceof RangeError) return res.status(400).json({ error: 'Invalid date' });
  if (error?.statusCode === 400 && error?.name === 'EntryInputError') {
    return res.status(400).json({ error: error.message });
  }
  if (error?.name === 'VersionError') {
    return res.status(409).json({
      error: 'This entry changed while it was being saved. Reload it before trying again.',
    });
  }
  return res.status(500).json({ error: 'Server error' });
}

function clientRequestIdFrom(payload = {}) {
  if (!Object.prototype.hasOwnProperty.call(payload, 'clientRequestId')) return '';
  const value = typeof payload.clientRequestId === 'string' ? payload.clientRequestId.trim() : '';
  return CLIENT_REQUEST_ID_PATTERN.test(value) ? value : null;
}

async function sendIdempotentEntry(res, entry, userId) {
  if (!entry) return false;
  if (entry.deletedAt) {
    res.status(409).json({ error: 'This capture already exists in trash' });
    return true;
  }
  let current = entry;
  if (entry.automationPending) {
    current = await updateEntryWithAutomation({ userId, entryId: entry._id, updates: {} }) || entry;
  }
  if (typeof current.populate === 'function') {
    await current.populate({ path: 'clusters', select: 'name slug icon color', match: { ownerId: userId } });
  }
  res.set('Idempotency-Replayed', 'true').status(200).json(current);
  return true;
}

/* --------------------------- Routes --------------------------- */

// Count with the same filters as the list endpoint
// GET /api/entries/count?hasSuggestedTasks=1&date=YYYY-MM-DD&...
router.get('/count', async (req, res) => {
  try {
    const userId = getUserIdFromRequest(req);
    const q = activeEntryQuery(userId);

    if (req.query.date) q.date = normalizeDate(req.query.date);
    if (req.query.startDate || req.query.endDate) {
      const range = {};
      if (req.query.startDate) range.$gte = normalizeDate(req.query.startDate);
      if (req.query.endDate) range.$lte = normalizeDate(req.query.endDate);
      q.date = range;
    }
    if (req.query.cluster) q.cluster = String(req.query.cluster);
    if (req.query.mood) q.mood = String(req.query.mood);
    if (req.query.hasSuggestedTasks) {
      q['suggestedTasks.0'] = { $exists: true };
    }

    const count = await Entry.countDocuments(q);
    res.json({ count });
  } catch (e) {
    logSafeError('GET /entries/count error', e);
    entryError(res, e);
  }
});

// List with flexible filters
// GET /api/entries?date=YYYY-MM-DD&cluster=Home&section=Games&sectionPageId=...&limit=50
router.get("/", async (req, res) => {
  try {
    const userId = getUserIdFromRequest(req);
    const q = activeEntryQuery(userId);

    if (req.query.date) q.date = normalizeDate(req.query.date);
    if (req.query.startDate || req.query.endDate) {
      const range = {};
      if (req.query.startDate) range.$gte = normalizeDate(req.query.startDate);
      if (req.query.endDate) range.$lte = normalizeDate(req.query.endDate);
      q.date = range;
    }
    if (req.query.cluster) q.cluster = String(req.query.cluster);
    if (req.query.clusterId && ObjectId.isValid(req.query.clusterId)) {
      q.clusters = new ObjectId(req.query.clusterId);
    }

    const sectionFilters = [];
    if (req.query.section && String(req.query.section).trim()) {
      sectionFilters.push({ section: String(req.query.section).trim() });
    }
    if (req.query.sectionId && ObjectId.isValid(req.query.sectionId)) {
      sectionFilters.push({ sectionId: new ObjectId(req.query.sectionId) });
    }
    if (sectionFilters.length === 1) {
      Object.assign(q, sectionFilters[0]);
    } else if (sectionFilters.length > 1) {
      q.$or = sectionFilters;
    }
    if (req.query.sectionPageId && ObjectId.isValid(req.query.sectionPageId)) {
      q.sectionPageId = new ObjectId(req.query.sectionPageId);
    }
    if (req.query.mood) q.mood = String(req.query.mood);
    if (req.query.tag) q.tags = String(req.query.tag);
    if (req.query.pinned !== undefined) {
      const pinned = String(req.query.pinned).toLowerCase();
      if (["1", "true", "yes"].includes(pinned)) q.pinned = true;
      else if (["0", "false", "no"].includes(pinned)) q.pinned = false;
    }

    if (req.query.cursor && ObjectId.isValid(req.query.cursor)) {
      q._id = { $lt: new ObjectId(req.query.cursor) };
    }

    const limit = Math.min(Math.max(parseInt(req.query.limit || "100", 10), 1), 500);
    const rows = await Entry.find(q)
      .sort({ pinned: -1, date: -1, createdAt: -1, _id: -1 })
      .limit(limit)
      .populate({ path: 'clusters', select: 'name slug icon color', match: { ownerId: userId } });
    res.json(rows);
  } catch (e) {
    logSafeError('GET /entries error', e);
    entryError(res, e);
  }
});

// Get by date (moved to avoid clashing with :id)
router.get("/by-date/:date", async (req, res) => {
  try {
    const userId = getUserIdFromRequest(req);
    const dateISO = normalizeDate(req.params.date);
    const rows = await Entry.find({ ...activeEntryQuery(userId), date: dateISO }).sort({ createdAt: -1 }).populate({ path: 'clusters', select: 'name slug icon color', match: { ownerId: userId } });
    res.json(rows);
  } catch (e) {
    logSafeError('GET /entries/by-date error', e);
    entryError(res, e);
  }
});

router.get('/trash', async (req, res) => {
  try {
    const userId = getUserIdFromRequest(req);
    const rows = await Entry.find({ userId, deletedAt: { $exists: true, $ne: null } })
      .sort({ deletedAt: -1, createdAt: -1 })
      .limit(100)
      .populate({ path: 'clusters', select: 'name slug icon color', match: { ownerId: userId } });
    res.json(rows);
  } catch (e) {
    logSafeError('GET /entries/trash error', e);
    entryError(res, e);
  }
});

// Get by ID (distinct from date)
router.get("/:id", async (req, res) => {
  try {
    const userId = getUserIdFromRequest(req);
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid id" });
    const doc = await Entry.findOne({ _id: id, ...activeEntryQuery(userId) }).populate({ path: 'clusters', select: 'name slug icon color', match: { ownerId: userId } });
    if (!doc) return res.status(404).json({ error: "Not found" });
    res.json(doc);
  } catch (e) {
    logSafeError('GET /entries/id error', e);
    entryError(res, e);
  }
});

// Create
router.post("/", async (req, res) => {
  try {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const payload = req.body || {};
    const clientRequestId = clientRequestIdFrom(payload);
    if (clientRequestId === null) {
      return res.status(400).json({ error: 'clientRequestId is invalid' });
    }
    if (clientRequestId) {
      const existing = await Entry.findOne({ userId, clientRequestId });
      if (await sendIdempotentEntry(res, existing, userId)) return;
    }

    const entry = await createEntryWithAutomation({
      userId,
      payload: clientRequestId ? { ...payload, clientRequestId } : payload,
    });
    await entry.populate({ path: 'clusters', select: 'name slug icon color', match: { ownerId: userId } });
    res.status(201).json(entry);
  } catch (e) {
    if (e?.code === 11000) {
      const userId = getUserIdFromRequest(req);
      const clientRequestId = clientRequestIdFrom(req.body || {});
      if (userId && clientRequestId) {
        const existing = await Entry.findOne({ userId, clientRequestId });
        if (await sendIdempotentEntry(res, existing, userId)) return;
      }
    }
    logSafeError('POST /entries error', e);
    entryError(res, e);
  }
});

// Retry an interrupted automation run without changing the journal text.
// The revision-aware automation layer makes repeated requests safe.
router.post('/:id/retry-automation', async (req, res) => {
  try {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
    const existing = await Entry.findOne({ _id: req.params.id, ...activeEntryQuery(userId) });
    if (!existing) return res.status(404).json({ error: 'Not found' });
    if (!existing.automationPending) return res.json(existing);
    const updated = await updateEntryWithAutomation({
      userId,
      entryId: existing._id,
      updates: {},
    });
    if (!updated) return res.status(404).json({ error: 'Not found' });
    await updated.populate({ path: 'clusters', select: 'name slug icon color', match: { ownerId: userId } });
    res.json(updated);
  } catch (e) {
    logSafeError('POST /entries/id/retry-automation error', e);
    entryError(res, e);
  }
});

// Update
router.patch("/:id", async (req, res) => {
  try {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid id" });

    const doc = await updateEntryWithAutomation({ userId, entryId: id, updates: req.body || {} });
    if (!doc) return res.status(404).json({ error: "Not found" });
    await doc.populate({ path: 'clusters', select: 'name slug icon color', match: { ownerId: userId } });
    res.json(doc);
  } catch (e) {
    logSafeError('PATCH /entries/id error', e);
    entryError(res, e);
  }
});

// Delete
router.delete("/:id", async (req, res) => {
  try {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid id" });

    const doc = await Entry.findOne({ _id: id, userId });
    if (!doc) return res.status(404).json({ error: "Not found" });
    if (!doc.deletedAt) {
      doc.deletedAt = new Date();
      await doc.save();
    }
    res.json({ ok: true, deleted: doc._id, trashed: true });
  } catch (e) {
    logSafeError('DELETE /entries/id error', e);
    res.status(500).json({ error: "Server error" });
  }
});

router.post('/:id/restore', async (req, res) => {
  try {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid id" });

    const doc = await Entry.findOneAndUpdate(
      { _id: id, userId, deletedAt: { $exists: true, $ne: null } },
      { $set: { deletedAt: null } },
      { new: true }
    ).populate({ path: 'clusters', select: 'name slug icon color', match: { ownerId: userId } });

    if (!doc) return res.status(404).json({ error: "Not found or not deleted" });
    res.json({ ok: true, entry: doc });
  } catch (e) {
    logSafeError('POST /entries/id restore error', e);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
