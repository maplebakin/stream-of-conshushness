// server/routes/appointments.js
import express from 'express';
import Appointment from '../models/Appointment.js';
import auth from '../middleware/auth.js';

const router = express.Router();

// Create appointment (time is OPTIONAL; if omitted, it's treated as all-day)
router.post('/', auth, async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;
    const {
      title,
      date,
      time,          // legacy single time
      timeStart,     // preferred field
      timeEnd,
      location = '',
      details = ''
    } = req.body || {};

    if (!userId) return res.status(401).json({ error: 'Access denied' });
    if (!title || !date) return res.status(400).json({ error: 'title and date are required' });

    const appt = await Appointment.create({
      userId,
      title: String(title).trim(),
      date,
      time: time || null,
      timeStart: timeStart || time || null,
      timeEnd: timeEnd || null,
      location,
      details
    });

    res.json(appt);
  } catch (err) {
    console.error('Create appointment failed:', err);
    res.status(500).json({ error: err?.message || 'Failed to create appointment' });
  }
});

// List appointments in a range (inclusive)
router.get('/', auth, async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;
    if (!userId) return res.status(401).json({ error: 'Access denied' });

    const { from, to } = req.query;
    const q = { userId };
    if (from && to) q.date = { $gte: from, $lte: to };
    else if (from) q.date = { $gte: from };
    else if (to) q.date = { $lte: to };

    const list = await Appointment.find(q).sort({ date: 1, timeStart: 1, time: 1, createdAt: 1 }).lean();
    res.json(list);
  } catch (err) {
    console.error('List appointments failed:', err);
    res.status(500).json({ error: err?.message || 'Failed to load appointments' });
  }
});

export default router;
