// routes/notes.js — schema-aligned REST for /api/notes + date bridges for /api/note/:date
import express from 'express';
import mongoose from 'mongoose';
import Note from '../models/Note.js';
import { normalizeClusterIds, resolveClusterIdForOwner, resolveClusterIdsForOwner } from '../utils/clusterIds.js';
import { torontoYmd } from '../utils/date.js';
import { logSafeError } from '../utils/errorHandler.js';
import { isValidISODate } from '../utils/recurrence.js';
import { resolveOwnedEntryId } from '../utils/ownedReferences.js';

const router = express.Router();
const IS_PROD = process.env.NODE_ENV === 'production';
const DEV_FALLBACKS = !IS_PROD && process.env.ALLOW_DEV_FALLBACKS === '1';

const isYMD = isValidISODate;

function own(userId) { return { userId }; }

function unclusteredDateNoteQuery(userId, date) {
  return {
    ...own(userId),
    date,
    $and: [
      { $or: [{ cluster: '' }, { cluster: null }, { cluster: { $exists: false } }] },
      { $or: [{ clusters: { $size: 0 } }, { clusters: { $exists: false } }] },
    ],
  };
}

function dateNoteUpsertQuery(userId, date, body = {}, clusterIds = []) {
  if (clusterIds.length) return { ...own(userId), date, clusters: clusterIds[0] };
  if (body?.cluster) return { ...own(userId), date, cluster: String(body.cluster) };
  return { ...own(userId), dailyKey: date };
}

// Build a doc that satisfies the Note schema
function normalizeNoteInput(body = {}, userId, resolvedClusterIds = [], entryReference = { present: false }) {
  const dateRaw = body.date || body.day || body.ymd || body.dateISO;
  let date = isYMD(dateRaw) ? dateRaw : torontoYmd();
  const content =
    body.content ?? body.text ?? body.body ?? body.html ?? body.markdown ?? '';
  const cluster = body.cluster ?? body.section ?? body.category;
  const hasClustersKey = Object.prototype.hasOwnProperty.call(body, 'clusters');
  const normalizedClusterIds = resolvedClusterIds.length
    ? resolvedClusterIds
    : hasClustersKey
      ? normalizeClusterIds(body.clusters)
      : [];

  const out = { ...body, userId, date, content };
  delete out.entryId;
  delete out.dailyKey;
  if (cluster !== undefined) out.cluster = cluster;
  if (hasClustersKey || resolvedClusterIds.length) out.clusters = normalizedClusterIds;
  if (Object.prototype.hasOwnProperty.call(body, 'clusterId') && !resolvedClusterIds.length) {
    out.clusters = normalizedClusterIds;
  }
  if (entryReference.present) out.entryId = entryReference.value;
  delete out.owner; delete out.user; delete out.createdBy;
  delete out.clusterId; delete out.clusterIds;
  return out;
}

function normalizeNotePatchInput(body = {}, resolvedClusterIds = [], entryReference = { present: false }) {
  const updates = {};
  const hasDate = ['date', 'day', 'ymd', 'dateISO'].some((key) => Object.prototype.hasOwnProperty.call(body, key));
  if (hasDate) {
    const date = body.date ?? body.day ?? body.ymd ?? body.dateISO;
    if (!isYMD(date)) throw new TypeError('Invalid note date');
    updates.date = date;
  }

  const hasContent = ['content', 'text', 'body', 'html', 'markdown']
    .some((key) => Object.prototype.hasOwnProperty.call(body, key));
  if (hasContent) updates.content = body.content ?? body.text ?? body.body ?? body.html ?? body.markdown ?? '';

  if (['cluster', 'section', 'category'].some((key) => Object.prototype.hasOwnProperty.call(body, key))) {
    updates.cluster = body.cluster ?? body.section ?? body.category ?? '';
  }
  if (
    Object.prototype.hasOwnProperty.call(body, 'clusters') ||
    Object.prototype.hasOwnProperty.call(body, 'clusterId')
  ) {
    updates.clusters = resolvedClusterIds;
  }
  if (entryReference.present) updates.entryId = entryReference.value;
  return updates;
}

async function resolveNoteEntryReference(userId, body = {}) {
  if (!Object.prototype.hasOwnProperty.call(body, 'entryId')) return { present: false };
  if (body.entryId == null || body.entryId === '') return { present: true, value: null };
  const value = await resolveOwnedEntryId(userId, body.entryId);
  if (!value) throw new TypeError('entryId must reference one of your entries');
  return { present: true, value };
}

async function promoteLegacyDailyNote(userId, date) {
  try {
    return await Note.findOneAndUpdate(
      { ...unclusteredDateNoteQuery(userId, date), dailyKey: { $exists: false } },
      { $set: { dailyKey: date } },
      { new: true, sort: { updatedAt: -1, createdAt: -1 } }
    );
  } catch (error) {
    // A concurrent request may have promoted another legacy row first.
    if (error?.code !== 11000) throw error;
    return null;
  }
}

/* ---------- core list/create under /api/notes ---------- */

// GET /api/notes?date=YYYY-MM-DD&entryId=<id>
router.get('/', async (req, res) => {
  try {
    const userId = req.user?.userId;
    const q = own(userId);
    if (isYMD(req.query.date)) q.date = req.query.date;
    if (req.query.entryId && mongoose.isValidObjectId(req.query.entryId)) {
      q.entryId = req.query.entryId;
    }
    const clusterFilters = [];
    if (req.query.cluster) {
      clusterFilters.push({ cluster: String(req.query.cluster) });
    }
    if (req.query.clusterId) {
      const resolved = await resolveClusterIdForOwner(userId, req.query.clusterId);
      if (!resolved) {
        return res.json({ ok: true, count: 0, items: [] });
      }
      clusterFilters.push({ clusters: resolved });
    }
    if (clusterFilters.length === 1) {
      Object.assign(q, clusterFilters[0]);
    } else if (clusterFilters.length > 1) {
      q.$or = clusterFilters;
    }
    const items = await Note.find(q).sort({ updatedAt: -1, createdAt: -1 }).limit(500).lean();
    res.json({ ok: true, count: items.length, items });
  } catch (e) {
    logSafeError('notes list failed', e);
    res.status(500).json({ error: 'notes list failed' });
  }
});

// POST /api/notes — create
router.post('/', async (req, res) => {
  const userId = req.user?.userId;
  try {
    let clusterIds = await resolveClusterIdsForOwner(userId, req.body?.clusters);
    if (!clusterIds.length && req.body?.clusterId) {
      const resolved = await resolveClusterIdForOwner(userId, req.body.clusterId);
      if (resolved) clusterIds = [resolved];
    } else if (!clusterIds.length && req.body?.cluster) {
      const resolved = await resolveClusterIdForOwner(userId, req.body.cluster);
      if (resolved) clusterIds = [resolved];
    }
    const entryReference = await resolveNoteEntryReference(userId, req.body || {});
    const doc = normalizeNoteInput(req.body, userId, clusterIds, entryReference);
    const created = await Note.create(doc);
    return res.status(201).json({ ok: true, item: created });
  } catch (e) {
    if (IS_PROD || !DEV_FALLBACKS) {
      logSafeError('notes create failed', e);
      return res.status(400).json({ error: 'note create failed' });
    }
    try {
      const clusterIds = await resolveClusterIdsForOwner(userId, req.body?.clusters);
      const entryReference = await resolveNoteEntryReference(userId, req.body || {});
      const doc = normalizeNoteInput(req.body, userId, clusterIds, entryReference);
      const coll = mongoose.connection.collection(Note?.collection?.name || 'notes');
      const r = await coll.insertOne({ ...doc, createdAt: new Date(), updatedAt: new Date() });
      const inserted = await coll.findOne({ _id: r.insertedId });
      return res.status(201).json({ ok: true, item: inserted, bypassedValidation: true });
    } catch (rawErr) {
      logSafeError('notes create fallback failed', rawErr);
      return res.status(400).json({ error: 'note create failed' });
    }
  }
});

/* ---------- DATE BRIDGES (fixes FE calls to /api/note/:date) ---------- */
/**
 * GET /api/notes/:date (YYYY-MM-DD)
 * Return 200 with { ok:true, item:null } if not found (quiet UI)
 */
router.get('/:date(\\d{4}-\\d{2}-\\d{2})', async (req, res) => {
  try {
    const userId = req.user?.userId;
    const date = req.params.date;
    const item = await Note.findOne({ userId, dailyKey: date })
      || await Note.findOne(unclusteredDateNoteQuery(userId, date));
    if (!item) return res.json({ ok: true, item: null, content: '' });
    res.json({ ok: true, item, content: item.content });
  } catch (e) {
    logSafeError('notes get by date failed', e);
    res.status(500).json({ error: 'note get failed' });
  }
});

router.post('/:date(\\d{4}-\\d{2}-\\d{2})', async (req, res) => {
  try {
    const userId = req.user?.userId;
    const date = req.params.date;
    let clusterIds = await resolveClusterIdsForOwner(userId, req.body?.clusters);
    if (!clusterIds.length && req.body?.clusterId) {
      const resolved = await resolveClusterIdForOwner(userId, req.body.clusterId);
      if (resolved) clusterIds = [resolved];
    } else if (!clusterIds.length && req.body?.cluster) {
      const resolved = await resolveClusterIdForOwner(userId, req.body.cluster);
      if (resolved) clusterIds = [resolved];
    }
    const entryReference = await resolveNoteEntryReference(userId, req.body || {});
    const updates = normalizeNoteInput({ ...req.body, date }, userId, clusterIds, entryReference);
    const isDailyNote = !clusterIds.length && !req.body?.cluster;
    if (isDailyNote) {
      await promoteLegacyDailyNote(userId, date);
      updates.dailyKey = date;
    }
    const item = await Note.findOneAndUpdate(
      dateNoteUpsertQuery(userId, date, req.body, clusterIds),
      { $set: updates, $currentDate: { updatedAt: true } },
      { new: true, upsert: true }
    );
    res.status(201).json({ ok: true, item, content: item.content });
  } catch (e) {
    logSafeError('notes upsert by date failed', e);
    res.status(400).json({ error: 'note upsert failed' });
  }
});

/* ---------- id-based CRUD ---------- */

// GET /api/notes/:id
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: 'invalid id' });
    const userId = req.user?.userId;
    const item = await Note.findOne({ _id: id, ...own(userId) });
    if (!item) return res.status(404).json({ error: 'not found' });
    res.json({ ok: true, item });
  } catch (e) {
    logSafeError('notes get failed', e);
    res.status(500).json({ error: 'note get failed' });
  }
});

// PATCH /api/notes/:id
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: 'invalid id' });
    const userId = req.user?.userId;
    let clusterIds = await resolveClusterIdsForOwner(userId, req.body?.clusters);
    if (!clusterIds.length && req.body?.clusterId) {
      const resolved = await resolveClusterIdForOwner(userId, req.body.clusterId);
      if (resolved) clusterIds = [resolved];
    } else if (!clusterIds.length && req.body?.cluster) {
      const resolved = await resolveClusterIdForOwner(userId, req.body.cluster);
      if (resolved) clusterIds = [resolved];
    }
    const entryReference = await resolveNoteEntryReference(userId, req.body || {});
    const updates = normalizeNotePatchInput(req.body || {}, clusterIds, entryReference);
    if (!Object.keys(updates).length) return res.status(400).json({ error: 'no valid updates' });

    const item = await Note.findOneAndUpdate(
      { _id: id, ...own(userId) },
      { $set: updates, $currentDate: { updatedAt: true } },
      { new: true, runValidators: true }
    );
    if (!item) return res.status(404).json({ error: 'not found' });
    res.json({ ok: true, item });
  } catch (e) {
    logSafeError('notes patch failed', e);
    res.status(400).json({ error: 'note update failed' });
  }
});

// DELETE /api/notes/:id
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: 'invalid id' });
    const userId = req.user?.userId;
    const r = await Note.deleteOne({ _id: id, ...own(userId) });
    if (!r.deletedCount) return res.status(404).json({ error: 'not found' });
    res.json({ ok: true });
  } catch (e) {
    logSafeError('notes delete failed', e);
    res.status(500).json({ error: 'note delete failed' });
  }
});

export default router;
