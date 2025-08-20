// routes/sectionPages.js
import express from 'express';
import SectionPage from '../models/SectionPage.js';
import Section from '../models/Section.js';
import auth from '../middleware/auth.js';

const router = express.Router();
router.use(auth);

function getUserId(req) {
  return req.user?.userId || req.user?._id || req.user?.id;
}

function slugify(str) {
  const s = String(str || '').toLowerCase().trim();
  return s
    .replace(/[\s_]+/g, '-')     // spaces/underscores -> dash
    .replace(/[^a-z0-9-]/g, '')  // safe chars only
    .replace(/-+/g, '-')         // collapse
    .replace(/^-+|-+$/g, '');    // trim
}

// GET /api/section-pages/:sectionKey?limit=50&offset=0
router.get('/:sectionKey', async (req, res) => {
  try {
    const userId = getUserId(req);
    const sectionKey = String(req.params.sectionKey);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 200);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

    const pages = await SectionPage.find({ userId, sectionKey })
      .sort({ order: 1, createdAt: 1, _id: 1 })
      .skip(offset)
      .limit(limit)
      .lean();

    res.json(pages);
  } catch (err) {
    console.error('GET /api/section-pages/:sectionKey error:', err);
    res.status(500).json({ error: 'Failed to fetch section pages' });
  }
});

// POST /api/section-pages
// body: { sectionKey, title, body, icon?, order? }
router.post('/', async (req, res) => {
  try {
    const userId = getUserId(req);
    const sectionKey = String(req.body?.sectionKey || '').trim();
    const title = String(req.body?.title || '').trim();
    if (!sectionKey || !title) return res.status(400).json({ error: 'sectionKey and title are required' });

    // Optional: ensure section exists for this user
    const exists = await Section.exists({ userId, key: sectionKey });
    if (!exists) return res.status(404).json({ error: 'Section not found' });

    const icon  = String(req.body?.icon || '');
    const body  = String(req.body?.body || '');
    const order = Number.isFinite(req.body?.order) ? Number(req.body.order) : 0;
    const slug  = slugify(req.body?.slug || title);

    const doc = await SectionPage.create({ userId, sectionKey, slug, title, body, icon, order });
    res.status(201).json(doc);
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ error: 'Page slug already exists in this section' });
    }
    console.error('POST /api/section-pages error:', err);
    res.status(500).json({ error: 'Failed to create section page' });
  }
});

// PATCH /api/section-pages/:id
router.patch('/:id', async (req, res) => {
  try {
    const userId = getUserId(req);
    const update = {};
    ['title','body','icon','order','visibility'].forEach(k => {
      if (k in req.body) update[k] = req.body[k];
    });
    if ('slug' in req.body) update.slug = slugify(req.body.slug);

    const doc = await SectionPage.findOneAndUpdate(
      { _id: req.params.id, userId },
      update,
      { new: true }
    );
    if (!doc) return res.status(404).json({ error: 'Page not found' });
    res.json(doc);
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ error: 'Page slug already exists in this section' });
    }
    console.error('PATCH /api/section-pages/:id error:', err);
    res.status(500).json({ error: 'Failed to update page' });
  }
});

// DELETE /api/section-pages/:id
router.delete('/:id', async (req, res) => {
  try {
    const userId = getUserId(req);
    const out = await SectionPage.deleteOne({ _id: req.params.id, userId });
    if (out.deletedCount === 0) return res.status(404).json({ error: 'Page not found' });
    res.sendStatus(204);
  } catch (err) {
    console.error('DELETE /api/section-pages/:id error:', err);
    res.status(500).json({ error: 'Failed to delete page' });
  }
});

export default router;
