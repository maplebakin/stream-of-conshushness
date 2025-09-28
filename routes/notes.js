// routes/notes.js — schema-aligned REST for /api/notes + date bridges for /api/note/:date
import express from 'express';
import mongoose from 'mongoose';
import Note from '../models/Note.js';
import { normalizeClusterIds, resolveClusterIdForOwner } from '../utils/clusterIds.js';

const router = express.Router();
const IS_PROD = process.env.NODE_ENV === 'production';
const DEV_FALLBACKS = !IS_PROD && process.env.ALLOW_DEV_FALLBACKS === '1';

// YYYY-MM-DD in America/Toronto (DST-safe)
function ymdInToronto(d = new Date()) {
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Toronto' });
}
const isYMD = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

function own(userId) { return { userId }; }

// Build a doc that satisfies the Note schema
function normalizeNoteInput(body = {}, userId, resolvedClusterIds = []) {
  const dateRaw = body.date || body.day || body.ymd || body.dateISO;
  let date = isYMD(dateRaw) ? dateRaw : ymdInToronto();
  const content =
    body.content ?? body.text ?? body.body ?? body.html ?? body.markdown ?? '';
  const cluster = body.cluster ?? body.section ?? body.category;
  const entryId = body.entryId && mongoose.isValidObjectId(body.entryId) ? body.entryId : undefined;
  const hasClustersKey = Object.prototype.hasOwnProperty.call(body, 'clusters');
  const normalizedClusterIds = resolvedClusterIds.length
    ? resolvedClusterIds
    : hasClustersKey
      ? normalizeClusterIds(body.clusters)
      : [];

  const out = { ...body, userId, date, content };
  if (cluster !== undefined) out.cluster = cluster;
  if (hasClustersKey || resolvedClusterIds.length) out.clusters = normalizedClusterIds;
  if (Object.prototype.hasOwnProperty.call(body, 'clusterId') && !resolvedClusterIds.length) {
    out.clusters = normalizedClusterIds;
  }
  if (entryId) out.entryId = entryId;
  delete out.owner; delete out.user; delete out.createdBy;
  delete out.clusterId; delete out.clusterIds;
  return out;
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
    console.error('[notes] list failed:', e);
    res.status(500).json({ error: 'notes list failed', detail: e.message });
  }
});

// POST /api/notes — create
router.post('/', async (req, res) => {
  const userId = req.user?.userId;
  let clusterIds = normalizeClusterIds(req.body?.clusters);
  if (!clusterIds.length && req.body?.clusterId) {
    const resolved = await resolveClusterIdForOwner(userId, req.body.clusterId);
    if (resolved) clusterIds = [resolved];
  } else if (!clusterIds.length && req.body?.cluster) {
    const resolved = await resolveClusterIdForOwner(userId, req.body.cluster);
    if (resolved) clusterIds = [resolved];
  }
  const doc = normalizeNoteInput(req.body, userId, clusterIds);
  try {
    const created = await Note.create(doc);
    return res.status(201).json({ ok: true, item: created });
  } catch (e) {
    if (IS_PROD) return res.status(400).json({ error: 'note create failed', detail: e.message });
    try {
      const coll = mongoose.connection.collection(Note?.collection?.name || 'notes');
      const r = await coll.insertOne({ ...doc, createdAt: new Date(), updatedAt: new Date() });
      const inserted = await coll.findOne({ _id: r.insertedId });
      return res.status(201).json({ ok: true, item: inserted, bypassedValidation: true });
    } catch (rawErr) {
      console.error('[notes] create failed:', e, '→ raw insert failed:', rawErr);
      return res.status(400).json({ error: 'note create failed', detail: e.message });
    }
  }
});

/* ---------- DATE BRIDGES (fixes FE calls to /api/note/:date) ---------- */
/**
// GET /api/notes/:date (YYYY-MM-DD)
// Return 200 with { ok:true, item:null } if not found (quiet UI)
router.get('/:date(\\d{4}-\\d{2}-\\d{2})', async (req, res) => {
  try {
    const userId = req.user?.userId;
    const date = req.params.date;
    const item = await Note.findOne({ userId, date });
    if (!item) return res.json({ ok: true, item: null, content: '' });
    res.json({ ok: true, item, content: item.content });
  } catch (e) {
    console.error('[notes] get by date failed:', e);
    res.status(500).json({ error: 'note get failed', detail: e.message });
  }
});

router.post('/:date(\\d{4}-\\d{2}-\\d{2})', async (req, res) => {
  try {
    const userId = req.user?.userId;
    const date = req.params.date;
    let clusterIds = normalizeClusterIds(req.body?.clusters);
    if (!clusterIds.length && req.body?.clusterId) {
      const resolved = await resolveClusterIdForOwner(userId, req.body.clusterId);
      if (resolved) clusterIds = [resolved];
    } else if (!clusterIds.length && req.body?.cluster) {
      const resolved = await resolveClusterIdForOwner(userId, req.body.cluster);
      if (resolved) clusterIds = [resolved];
    }
    const updates = normalizeNoteInput({ ...req.body, date }, userId, clusterIds);
    const item = await Note.findOneAndUpdate(
      { ...own(userId), date },
      { $set: updates, $currentDate: { updatedAt: true } },
      { new: true, upsert: true }
    );
    res.status(201).json({ ok: true, item, content: item.content });
  } catch (e) {
    console.error('[notes] upsert by date failed:', e);
    res.status(400).json({ error: 'note upsert failed', detail: e.message });
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
    console.error('[notes] get failed:', e);
    res.status(500).json({ error: 'note get failed', detail: e.message });
  }
});

// PATCH /api/notes/:id
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: 'invalid id' });
    const userId = req.user?.userId;
    let clusterIds = normalizeClusterIds(req.body?.clusters);
    if (!clusterIds.length && req.body?.clusterId) {
      const resolved = await resolveClusterIdForOwner(userId, req.body.clusterId);
      if (resolved) clusterIds = [resolved];
    } else if (!clusterIds.length && req.body?.cluster) {
      const resolved = await resolveClusterIdForOwner(userId, req.body.cluster);
      if (resolved) clusterIds = [resolved];
    }
    const updates = normalizeNoteInput(req.body || {}, userId, clusterIds);
    delete updates.userId;

    const item = await Note.findOneAndUpdate(
      { _id: id, ...own(userId) },
      { $set: updates, $currentDate: { updatedAt: true } },
      { new: true, runValidators: true }
    );
    if (!item) return res.status(404).json({ error: 'not found' });
    res.json({ ok: true, item });
  } catch (e) {
    console.error('[notes] patch failed:', e);
    res.status(400).json({ error: 'note update failed', detail: e.message });
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
    console.error('[notes] delete failed:', e);
    res.status(500).json({ error: 'note delete failed', detail: e.message });
  }
});

export default router;
