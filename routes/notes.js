import express from 'express';
import auth from '../middleware/auth.js';
import Note from '../models/Note.js';

const router = express.Router();

// Logging to confirm the file is being used
console.log('📝 notes route loaded');

// Get note for a specific date
router.get('/:date', auth, async (req, res) => {
  console.log('📥 GET note for', req.params.date);
  try {
    const note = await Note.findOne({ userId: req.user._id, date: req.params.date });
    if (!note) {
      return res.status(404).json({ error: 'Note not found' });
    }
    res.json(note);
  } catch (err) {
    console.error('❌ error in GET /note/:date', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Save or update note for a date
router.post('/:date', auth, async (req, res) => {
  console.log('📥 POST note for', req.params.date, req.body);
  try {
    const { content, cluster, entryId } = req.body;

    const note = await Note.findOneAndUpdate(
      { userId: req.user._id, date: req.params.date },
      { content, cluster, entryId },
      { new: true, upsert: true }
    );

    res.json(note);
  } catch (err) {
    console.error('❌ error in POST /note/:date', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
