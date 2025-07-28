import express from 'express';
import SectionPage from '../models/SectionPage.js';
import auth from '../middleware/auth.js';
const router = express.Router();

// Get all pages for a section
router.get('/:section', auth, async (req, res) => {
  const pages = await SectionPage.find({ section: req.params.section, userId: req.user._id });
  res.json(pages);
});

// Get a single page
router.get('/:section/:slug', auth, async (req, res) => {
  const page = await SectionPage.findOne({
    section: req.params.section,
    slug: req.params.slug,
    userId: req.user._id,
  });
  if (!page) return res.status(404).json({ error: 'Page not found' });
  res.json(page);
});

// Create a page
router.post('/', auth, async (req, res) => {
  const { section, slug, title, content } = req.body;
  const page = new SectionPage({ section, slug, title, content, userId: req.user._id });
  await page.save();
  res.status(201).json(page);
});

// Update a page
router.put('/:id', auth, async (req, res) => {
  const page = await SectionPage.findOneAndUpdate(
    { _id: req.params.id, userId: req.user._id },
    req.body,
    { new: true }
  );
  if (!page) return res.status(404).json({ error: 'Page not found' });
  res.json(page);
});

// Delete a page
router.delete('/:id', auth, async (req, res) => {
  const deleted = await SectionPage.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
  if (!deleted) return res.status(404).json({ error: 'Page not found' });
  res.json({ success: true });
});

export default router;
