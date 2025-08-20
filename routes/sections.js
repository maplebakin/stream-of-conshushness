// routes/sections.js
import express from 'express';
import Section from '../models/Section.js';
import auth from '../middleware/auth.js';

const router = express.Router();
router.use(auth);

function getUserId(req) {
  return req.user?.userId || req.user?._id || req.user?.id;
}

function sanitizeKey(str) {
  const s = String(str || '').toLowerCase().trim();
  return s
    .replace(/[\s_]+/g, '-')     // spaces/underscores -> dash
    .replace(/[^a-z0-9-]/g, '')  // strip non-url chars
    .replace(/-+/g, '-')         // collapse dashes
    .replace(/^-+|-+$/g, '');    // trim dashes
}

// GET /api/sections?pin=true|false&limit=50&offset=0&q=foo
router.get('/', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { pin, limit = 100, offset = 0, q } = req.query;

    const find = { userId };
    if (pin === 'true') find.pinned = true;
    if (q && String(q).trim()) {
      find.$or = [
        { key:   new RegExp(String(q).trim(), 'i') },
        { label: new RegExp(String(q).trim(), 'i') },
        { description: new RegExp(String(q).trim(), 'i') }
      ];
    }

    const lim = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
    const off = Math.max(parseInt(offset, 10) || 0, 0);

    const list = await Section
      .find(find)
      .sort({ pinned: -1, order: 1, label: 1, _id: 1 })
      .skip(off)
      .limit(lim)
      .lean();

    // include aliases for current FE expectations (slug/name/emoji)
    const shaped = list.map(s => ({
      ...s,
      slug: s.key,
      name: s.label,
      emoji: s.icon
    }));

    res.json(shaped);
  } catch (err) {
    console.error('GET /api/sections error:', err);
    res.status(500).json({ error: 'Failed to fetch sections' });
  }
});

// GET /api/sections/:key
router.get('/:key', async (req, res) => {
  try {
    const userId = getUserId(req);
    const key = String(req.params.key);
    const doc = await Section.findOne({ userId, key });
    if (!doc) return res.status(404).json({ error: 'Section not found' });
    res.json({ ...doc.toObject(), slug: doc.key, name: doc.label, emoji: doc.icon });
  } catch (err) {
    console.error('GET /api/sections/:key error:', err);
    res.status(500).json({ error: 'Failed to fetch section' });
  }
});

// POST /api/sections
// body: { key?, label, color?, icon?, description?, pinned?, order? }
router.post('/', async (req, res) => {
  try {
    const userId = getUserId(req);
    const label = String(req.body?.label || '').trim();
    if (!label) return res.status(400).json({ error: 'label is required' });

    const key = sanitizeKey(req.body?.key || label);
    const color = String(req.body?.color || '#5cc2ff');
    const icon  = String(req.body?.icon || '📚');
    const description = String(req.body?.description || '');
    const pinned = Boolean(req.body?.pinned);
    const order  = Number.isFinite(req.body?.order) ? Number(req.body.order) : 0;

    const doc = await Section.create({ userId, key, label, color, icon, description, pinned, order });
    res.status(201).json({ ...doc.toObject(), slug: doc.key, name: doc.label, emoji: doc.icon });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ error: 'Section key already exists' });
    }
    console.error('POST /api/sections error:', err);
    res.status(500).json({ error: 'Failed to create section' });
  }
});

// PATCH /api/sections/:id
router.patch('/:id', async (req, res) => {
  try {
    const userId = getUserId(req);
    const update = {};
    ['label','color','icon','description','pinned','order'].forEach(k => {
      if (k in req.body) update[k] = req.body[k];
    });
    if ('key' in req.body) update.key = sanitizeKey(req.body.key);

    const doc = await Section.findOneAndUpdate(
      { _id: req.params.id, userId },
      update,
      { new: true }
    );
    if (!doc) return res.status(404).json({ error: 'Section not found' });
    res.json({ ...doc.toObject(), slug: doc.key, name: doc.label, emoji: doc.icon });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ error: 'Section key already exists' });
    }
    console.error('PATCH /api/sections/:id error:', err);
    res.status(500).json({ error: 'Failed to update section' });
  }
});

// DELETE /api/sections/:id
router.delete('/:id', async (req, res) => {
  try {
    const userId = getUserId(req);
    const out = await Section.deleteOne({ _id: req.params.id, userId });
    if (out.deletedCount === 0) return res.status(404).json({ error: 'Section not found' });
    res.sendStatus(204);
  } catch (err) {
    console.error('DELETE /api/sections/:id error:', err);
    res.status(500).json({ error: 'Failed to delete section' });
  }
});

export default router;
