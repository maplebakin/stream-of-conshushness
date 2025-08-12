// routes/appointments.js
import express from 'express';
import Appointment from '../models/Appointment.js';
import auth from '../middleware/auth.js';

const router = express.Router();

/** helper: normalize user id across JWT shapes */
function getUserId(req) {
  return req.user?._id || req.user?.userId || req.user?.id;
}

/**
 * GET /api/appointments
 * Optional: ?date=YYYY-MM-DD
 * Returns all appointments for the user, optionally filtered by exact date.
 */
router.get('/', auth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const date = req.query.date || req.query.dueDate;
    const q = { userId };
    if (date) q.date = date; // stored as "YYYY-MM-DD" string in this model
    const items = await Appointment.find(q).sort({ date: 1, time: 1 });
    res.json(items);
  } catch (err) {
    console.error('GET /appointments error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * GET /api/appointments/:date
 * Returns appointments for a specific date (YYYY-MM-DD).
 */
router.get('/:date', auth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const date = req.params.date;
    const items = await Appointment.find({ userId, date }).sort({ time: 1 });
    res.json(items);
  } catch (err) {
    console.error('GET /appointments/:date error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /api/appointments
 * Body: { date: 'YYYY-MM-DD', time: 'HH:mm', details: string, cluster?: string }
 */
router.post('/', auth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const { date, time, details, cluster } = req.body;
    if (!date || !time || !details) {
      return res.status(400).json({ error: 'date, time, and details are required' });
    }
    const appt = await Appointment.create({
      userId, date, time, details, cluster: cluster || undefined
    });
    res.status(201).json(appt);
  } catch (err) {
    console.error('POST /appointments error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * PUT /api/appointments/:id
 * Body: any subset of { date, time, details, cluster }
 */
router.put('/:id', auth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const updated = await Appointment.findOneAndUpdate(
      { _id: req.params.id, userId },
      req.body,
      { new: true }
    );
    if (!updated) return res.status(404).json({ error: 'Not found' });
    res.json(updated);
  } catch (err) {
    console.error('PUT /appointments/:id error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * DELETE /api/appointments/:id
 */
router.delete('/:id', auth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const del = await Appointment.findOneAndDelete({ _id: req.params.id, userId });
    if (!del) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /appointments/:id error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
