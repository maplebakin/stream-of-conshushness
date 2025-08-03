import express from 'express';
import Entry from '../models/Entry.js';
import Ripple from '../models/Ripple.js';
import { extractRipples } from '../utils/rippleExtractor.js';

const router = express.Router();

// Get all entries (optionally by section)
router.get('/', async (req, res) => {
  const { section } = req.query;
  const query = { userId: req.user.userId };
  if (section) {
    query.section = new RegExp(`^${section}$`, 'i');
  }
  try {
    const entries = await Entry.find(query).sort({ date: -1 });
    res.json(entries);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch entries' });
  }
});

// Get entries by date
router.get('/:date', async (req, res) => {
  try {
    const entries = await Entry.find({
      userId: req.user.userId,
      date: req.params.date,
    });
    res.json(entries);
  } catch {
    res.status(500).json({ error: 'Server error fetching entries' });
  }
});

// Add new entry + extract ripples
router.post('/', async (req, res) => {
  const { date, section, tags, content } = req.body;
  if (!date || !section || !content) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  try {
    const newEntry = new Entry({
      userId: req.user.userId,
      date,
      section,
      tags: tags || [],
      content,
    });
    await newEntry.save();
    const extracted = extractRipples([newEntry]);
    const savedRipples = [];
    for (const r of extracted) {
      const ripple = new Ripple({
        userId: req.user.userId,
        sourceEntryId: newEntry._id,
        ...r,
      });
      savedRipples.push(await ripple.save());
    }
    res.json({ entry: newEntry, ripples: savedRipples });
  } catch (err) {
    res.status(500).json({ error: 'Server error saving entry or ripples' });
  }
});
export default router;
