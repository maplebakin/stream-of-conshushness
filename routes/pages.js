import express from 'express';
import SectionPage from '../models/SectionPage.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Create a new page in a section
router.post('/', authenticateToken, async (req, res) => {
  const { section, slug, title, content } = req.body;
  try {
    const newPage = new SectionPage({
      section,
      slug,
      title,
      content,
      userId: req.user.userId,
    });
    await newPage.save();
    res.json(newPage);
  } catch (err) {
    console.error('❌ Error creating section page:', err);
    res.status(500).json({ message: 'Server error creating page' });
  }
});

export default router;
