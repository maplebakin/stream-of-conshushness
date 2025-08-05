// routes/entries.js
import express        from 'express';
import auth           from '../middleware/auth.js';

import Entry          from '../models/Entry.js';
import Ripple         from '../models/Ripple.js';
import Task           from '../models/Task.js';
import SuggestedTask  from '../models/SuggestedTask.js';

import { extractRipples } from '../utils/rippleExtractor.js';

const router = express.Router();
router.use(auth);

/* ───────────── GET /api/entries  (?section=) ───────────── */
router.get('/', async (req, res) => {
  const { section } = req.query;
  const query = { userId: req.user.userId };
  if (section) query.section = new RegExp(`^${section}$`, 'i');

  try {
    const entries = await Entry.find(query).sort({ date: -1, createdAt: -1 });
    res.json(entries);
  } catch {
    res.status(500).json({ error: 'Failed to fetch entries' });
  }
});

/* ───────────── GET /api/entries/:date  (YYYY-MM-DD) ───────────── */
router.get('/:date', async (req, res) => {
  try {
    const entries = await Entry
      .find({ userId: req.user.userId, date: req.params.date })
      .sort({ createdAt: -1 });
    res.json(entries);
  } catch {
    res.status(500).json({ error: 'Server error fetching entries' });
  }
});

/* ───────────── POST /api/entries  (create + ripples + suggested) ───────────── */
router.post('/', async (req, res) => {
  const { date, section, tags, content } = req.body;
  if (!date || !section || !content) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    /* 1. Save Entry */
    const entry = await new Entry({
      userId : req.user.userId,
      date,
      section,
      tags   : tags || [],
      content
    }).save();

    /* 2. Extract ripples */
    const extracted = extractRipples([entry]);

    /* 3. Split: auto-approve vs manual */
    const autoRipples   = extracted.filter(r => r.priority === 'high' && r.confidence >= 0.8);
    const manualRipples = extracted.filter(r => !autoRipples.includes(r));

    /* 4. Auto-create Tasks */
    for (const r of autoRipples) {
      const task = await new Task({
        userId  : req.user.userId,
        title   : r.extractedText,
        cluster : r.assignedCluster ?? null,
        priority: r.priority,
        dueDate : r.dueDate   ?? undefined,
        repeat  : r.recurrence?? undefined
      }).save();
      r.status        = 'approved';
      r.createdTaskId = task._id;
    }

    /* 5. Save ALL ripples */
    const savedRipples = [];
    for (const r of [...autoRipples, ...manualRipples]) {
      const ripple = await new Ripple({
        userId       : req.user.userId,
        sourceEntryId: entry._id,
        entryDate    : entry.date,
        ...r
      }).save();
      savedRipples.push(ripple);
    }

    /* 6. Write SuggestedTask docs for remaining task-type ripples */
    const suggestedTasks = [];
    for (const ripple of savedRipples) {
      if (ripple.status === 'pending' && ripple.type.endsWith('Task')) {
        suggestedTasks.push(await SuggestedTask.create({
          userId        : req.user.userId,
          sourceRippleId: ripple._id,
          title         : ripple.extractedText,
          priority      : ripple.priority,
          dueDate       : ripple.dueDate   ?? undefined,
          repeat        : ripple.recurrence?? undefined,
          cluster       : ripple.assignedCluster ?? null
        }));
      }
    }

    res.json({ entry, ripples: savedRipples, suggestedTasks });
  } catch (err) {
    console.error('❌ Error saving entry / ripples:', err);
    res.status(500).json({ error: 'Server error saving entry or ripples' });
  }
});

/* ───────────── PUT /api/entries/:id  (update) ───────────── */
router.put('/:id', async (req, res) => {
  try {
    const updated = await Entry.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.userId },
      req.body,
      { new: true }
    );
    if (!updated) return res.status(404).json({ error: 'Entry not found' });
    res.json(updated);
  } catch (err) {
    console.error('❌ Error updating entry:', err);
    res.status(500).json({ error: 'Server error updating entry' });
  }
});

/* ───────────── DELETE /api/entries/:id  (entry + ripples) ───────────── */
router.delete('/:id', async (req, res) => {
  try {
    const deleted = await Entry.findOneAndDelete({
      _id: req.params.id,
      userId: req.user.userId
    });
    if (!deleted) return res.status(404).json({ error: 'Entry not found' });

    await Ripple.deleteMany({ sourceEntryId: req.params.id });
    await SuggestedTask.deleteMany({ sourceRippleId: { $in: [] } }); // optional clean-up
    res.json({ message: 'Entry and associated ripples deleted' });
  } catch (err) {
    console.error('❌ Error deleting entry:', err);
    res.status(500).json({ error: 'Server error deleting entry' });
  }
});

export default router;
