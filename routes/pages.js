import express from 'express';
import Page from '../models/Page.js';
import authMiddleware from '../middleware/auth.js';
const router = express.Router();

router.get('/', authMiddleware, async (req, res) => {
  const { section } = req.query;
  const pages = await Page.find({ userId: req.user.id, section }).sort({ createdAt: -1 });
  res.json(pages);
});

router.post('/', authMiddleware, async (req, res) => {
  const { title, section, content } = req.body;
  const slug = title.toLowerCase().replace(/\s+/g, '-');
  const newPage = new Page({ title, slug, section, content, userId: req.user.id });
  await newPage.save();
  res.status(201).json(newPage);
});

export default router;
