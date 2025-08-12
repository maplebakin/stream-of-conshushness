// routes/events.js
import express from 'express';
import ImportantEvent from '../models/ImportantEvent.js';
import auth from '../middleware/auth.js';

const router = express.Router();

function getUserId(req) {
  return req.user?._id || req.user?.userId || req.user?.id;
}

/**
 * GET /api/events
 * Optional: ?date=YYYY-MM-DD
 */
router.get('/', auth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const { date } = req.query;
    const q = { userId };
    if (date) q.date = date; // model stores "YYYY-MM-DD"
    const items = await ImportantEvent.find(q).sort({ date: 1, name: 1 });
    res.json(items);
  } catch (e) {
    console.error('GET /events error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});


 router.post('/', auth, async (req, res) => {
  try {
     const userId = getUserId(req);
    const { name, date, details, recurring } = req.body;
    if (!name || !date) return res.status(400).json({ error: 'name and date are required' });
    const ev = await ImportantEvent.create({ userId, name, date, details, recurring });
    res.status(201).json(ev);
  } catch (e) {
    
  console.error('POST /events error:', e);
     res.status(500).json({ error: 'Server error' });
   }
 });

export default router;
