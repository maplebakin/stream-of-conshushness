import { Router } from 'express';
import ScheduleItem from '../models/ScheduleItem.js';

const r = Router();

// GET /api/schedule/:date  → [{ hour, text }, ...]
r.get('/:date', async (req, res) => {
  const userId = req.user.userId;
  const { date } = req.params;
  const rows = await ScheduleItem.find({ userId, date }).sort({ hour: 1 });
  res.json(rows.map(x => ({ hour: x.hour, text: x.text })));
});

// POST /api/schedule  body: { date, hour, text }
r.post('/', async (req, res) => {
  const userId = req.user.userId;
  const { date, hour, text = '' } = req.body || {};
  if (!date || !hour) return res.status(400).json({ error: 'date and hour required' });

  const doc = await ScheduleItem.findOneAndUpdate(
    { userId, date, hour },
    { $set: { text } },
    { new: true, upsert: true }
  );
  res.json({ ok: true, hour: doc.hour, text: doc.text });
});

export default r;
