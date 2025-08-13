// routes/sections.js
import express from 'express';
import Section from '../models/Section.js';
import auth from '../middleware/auth.js';

const router = express.Router();

/** helper: normalize user id across JWT shapes */
function getUserId(req) {
  return req.user?.userId || req.user?._id || req.user?.id;
}

// GET /api/sections  ➜ list user’s sections
router.get('/', auth, async (req, res) => {
  const sections = await Section.find({ owner: getUserId(req) }).sort('name');
  res.json(sections);
});

// POST /api/sections ➜ create
router.post('/', auth, async (req, res) => {
  const { name, slug, icon, color } = req.body;
  const section = await Section.create({
    name,
    slug,
    icon: icon || '',
    color: color || '#aaaaaa',
    owner: getUserId(req)
  });
  res.status(201).json(section);
});

// PATCH /api/sections/:id
router.patch('/:id', auth, async (req, res) => {
  const update = {};
  ['name', 'slug', 'icon', 'color'].forEach((k) => {
    if (k in req.body) update[k] = req.body[k];
  });

  const section = await Section.findOneAndUpdate(
    { _id: req.params.id, owner: getUserId(req) },
    update,
    { new: true }
  );
  if (!section) return res.status(404).json({ error: 'Section not found' });
  res.json(section);
});

// DELETE /api/sections/:id
router.delete('/:id', auth, async (req, res) => {
  const out = await Section.deleteOne({ _id: req.params.id, owner: getUserId(req) });
  if (out.deletedCount === 0) return res.status(404).json({ error: 'Section not found' });
  res.sendStatus(204);
});

export default router;
