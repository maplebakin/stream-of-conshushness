import express from 'express';
import DailySchedule from '../models/DailySchedule.js';
import auth from '../middleware/auth.js';

const router = express.Router();

// Get full schedule for a day
router.get('/:date', auth, async (req, res) => {
  try {
    const schedule = await DailySchedule.find({
      userId: req.user._id,
      date: req.params.date,
    }).sort({ hour: 1 }); // sort by hour just in case
    res.json(schedule);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Upsert one hour block
router.post('/:date/:hour', auth, async (req, res) => {
  try {
    const { text } = req.body;
    const updated = await DailySchedule.findOneAndUpdate(
      {
        userId: req.user._id,
        date: req.params.date,
        hour: req.params.hour,
      },
      {
        $set: { text: text || '' },
      },
      { upsert: true, new: true }
    );
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
