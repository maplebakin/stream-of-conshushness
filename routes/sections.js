// routes/sections.js
import express from 'express';
import Section from '../models/Section.js';
import auth from '../middleware/auth.js';

const router = express.Router();

// GET /api/sections  ➜ list user’s sections
router.get('/', auth, async (req, res) => {
  const sections = await Section.find({ owner: req.user.id }).sort('name');
  res.json(sections);
});

// POST /api/sections ➜ create
router.post('/', auth, async (req, res) => {
  const { name, slug, icon, color } = req.body;
  const section = await Section.create({ name, slug, icon, color, owner: req.user.id });
  res.status(201).json(section);
});

// PUT /api/sections/:id ➜ update
router.put('/:id', auth, async (req, res) => {
  const section = await Section.findOneAndUpdate(
    { _id: req.params.id, owner: req.user.id },
    req.body,
    { new: true }
  );
  res.json(section);
});

// DELETE /api/sections/:id
router.delete('/:id', auth, async (req, res) => {
  await Section.deleteOne({ _id: req.params.id, owner: req.user.id });
  res.sendStatus(204);
});

export default router;
