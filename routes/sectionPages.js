// routes/sectionPages.js — tolerant REST at /api/section-pages (dev-only raw insert guarded)

import express from 'express';
import mongoose from 'mongoose';
import SectionPage from '../models/SectionPage.js';

const router = express.Router();
const IS_PROD = process.env.NODE_ENV === 'production';
const DEV_FALLBACKS = !IS_PROD && process.env.ALLOW_DEV_FALLBACKS === '1';

function own(userId) {
  return {
    $or: [
      { owner: userId },
      { userId },
      { user: userId },
      { createdBy: userId },
    ],
  };
}

const slugify = (s = '') =>
  s.toString().toLowerCase()
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/--+/g, '-') || 'page';

async function uniqueSlug(base, userId) {
  let s = slugify(base);
  let i = 0;
  while (true) {
    const exists = await SectionPage.findOne({
      $and: [
        own(userId),
        { $or: [{ slug: s }, { pageKey: s }] },
      ],
    }).lean();
    if (!exists) return s;
    i += 1;
    s = `${slugify(base)}-${i}`;
    if (i > 99) return `${slugify(base)}-${Date.now()}`;
  }
}

const pickBody = (b) => b?.body ?? b?.content ?? b?.html ?? b?.markdown ?? '';

function normalizePageInput(body = {}, userId, slugMaybe) {
  const sectionKey = body.sectionKey ?? body.section ?? body.key ?? '__misc__';
  const title = body.title ?? body.name ?? 'Untitled Page';
  const out = {
    sectionKey,
    title,
    body: pickBody(body),
    ...body, // keep extras
    owner: body.owner || userId,
    userId: body.userId || userId,
    user: body.user || userId,
    createdBy: body.createdBy || userId,
  };
  if (slugMaybe) {
    out.slug = slugMaybe;
    out.pageKey = body.pageKey || slugMaybe;
  }
  return out;
}

// GET /api/section-pages
router.get('/', async (req, res) => {
  try {
    const userId = req.user?.userId;
    const items = await SectionPage.find(own(userId))
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(500)
      .lean();
    res.json({ ok: true, count: items.length, items });
  } catch (e) {
    console.error('[section-pages] list failed:', e);
    res.status(500).json({ error: 'section-pages list failed', detail: e.message });
  }
});

// GET /api/section-pages/by-section/:sectionKey
router.get('/by-section/:sectionKey', async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { sectionKey } = req.params;
    const items = await SectionPage.find({ ...own(userId), sectionKey })
      .sort({ updatedAt: -1 })
      .lean();
    res.json({ ok: true, count: items.length, items });
  } catch (e) {
    console.error('[section-pages] by-section failed:', e);
    res.status(500).json({ error: 'section-pages by-section failed', detail: e.message });
  }
});

// POST /api/section-pages — create
router.post('/', async (req, res) => {
  const userId = req.user?.userId;

  try {
    const slug = await uniqueSlug(req.body?.title || req.body?.name || 'page', userId);
    const doc = normalizePageInput(req.body, userId, slug);
    const created = await SectionPage.create(doc);
    return res.status(201).json({ ok: true, item: created });
  } catch (e) {
    // In production: do NOT bypass validators.
    if (IS_PROD) {
      return res.status(400).json({ error: 'section-page create failed', detail: e.message });
    }
    // Dev-only raw insert fallback.
    try {
      const collName = SectionPage?.collection?.name || 'sectionpages';
      const coll = mongoose.connection.collection(collName);
      const slug = await uniqueSlug(req.body?.title || req.body?.name || 'page', userId);
      const doc = normalizePageInput(req.body, userId, slug);
      const r = await coll.insertOne({
        ...doc,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const inserted = await coll.findOne({ _id: r.insertedId });
      return res.status(201).json({ ok: true, item: inserted, bypassedValidation: true });
    } catch (rawErr) {
      console.error('[section-pages] create failed:', e, '→ raw insert failed:', rawErr);
      return res.status(400).json({ error: 'section-page create failed', detail: e.message });
    }
  }
});

// GET /api/section-pages/:id
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: 'invalid id' });
    const userId = req.user?.userId;

    const item = await SectionPage.findOne({ _id: id, ...own(userId) });
    if (!item) return res.status(404).json({ error: 'not found' });
    res.json({ ok: true, item });
  } catch (e) {
    console.error('[section-pages] get failed:', e);
    res.status(500).json({ error: 'section-page get failed', detail: e.message });
  }
});

// PATCH /api/section-pages/:id
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: 'invalid id' });
    const userId = req.user?.userId;

    const updates = { ...(req.body || {}) };
    delete updates.owner; delete updates.user; delete updates.userId; delete updates.createdBy;

    const item = await SectionPage.findOneAndUpdate(
      { _id: id, ...own(userId) },
      { $set: updates, $currentDate: { updatedAt: true } },
      { new: true, runValidators: false }
    );
    if (!item) return res.status(404).json({ error: 'not found' });
    res.json({ ok: true, item });
  } catch (e) {
    console.error('[section-pages] patch failed:', e);
    res.status(400).json({ error: 'section-page update failed', detail: e.message });
  }
});

// DELETE /api/section-pages/:id
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: 'invalid id' });
    const userId = req.user?.userId;

    const r = await SectionPage.deleteOne({ _id: id, ...own(userId) });
    if (!r.deletedCount) return res.status(404).json({ error: 'not found' });
    res.json({ ok: true });
  } catch (e) {
    console.error('[section-pages] delete failed:', e);
    res.status(500).json({ error: 'section-page delete failed', detail: e.message });
  }
});

export default router;
