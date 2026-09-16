import { Router } from 'express';
import ScheduleItem from '../models/ScheduleItem.js';
import { isValidISODate } from '../utils/recurrence.js';
import { logSafeError } from '../utils/errorHandler.js';

const r = Router();

// GET /api/schedule/:date  → [{ hour, text }, ...]
r.get('/:date', async (req, res) => {
  try {
    const userId = req.user.userId;
    const { date } = req.params;
    if (!isValidISODate(date)) return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
    const rows = await ScheduleItem.find({ userId, date }).sort({ hour: 1 });
    return res.json(rows.map(x => ({ hour: x.hour, text: x.text })));
  } catch (error) {
    logSafeError('schedule list failed', error);
    return res.status(500).json({ error: 'Failed to load schedule' });
  }
});

// POST /api/schedule  body: { date, hour, text }
r.post('/', async (req, res) => {
  try {
    const userId = req.user.userId;
    const { date, hour, text = '' } = req.body || {};
    if (!isValidISODate(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(hour || ''))) {
      return res.status(400).json({ error: 'valid date and hour are required' });
    }

    const doc = await ScheduleItem.findOneAndUpdate(
      { userId, date, hour },
      { $set: { text: typeof text === 'string' ? text : '' } },
      { new: true, upsert: true, runValidators: true }
    );
    return res.json({ ok: true, hour: doc.hour, text: doc.text });
  } catch (error) {
    logSafeError('schedule update failed', error);
    return res.status(500).json({ error: 'Failed to update schedule' });
  }
});

export default r;
