import express from 'express';
import auth from '../middleware/auth.js';
import Note from '../models/Note.js';

const router = express.Router();
console.log('📝 notes route loaded');

// Normalize JWT user id across payload shapes
function getUserId(req) {
  return req.user?._id || req.user?.userId || req.user?.id;
}

// Get note for a specific date
router.get('/:date', auth, async (req, res) => {
  console.log('📥 GET note for', req.params.date);
  try {
    const note = await Note.findOne({ userId: getUserId(req), date: req.params.date });
    if (!note) return res.status(404).json({ error: 'Note not found' });
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
      { userId: getUserId(req), date: req.params.date },
      { content: content || '', cluster: cluster || '', entryId: entryId || null },
      { upsert: true, new: true }
    );
    res.json(note);
  } catch (err) {
    console.error('❌ error in POST /note/:date', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
