import express from 'express';
import auth from '../middleware/auth.js';
import Task from '../models/Task.js';
import Appointment from '../models/Appointment.js';
import ImportantEvent from '../models/ImportantEvent.js';

const router = express.Router();

// Normalize JWT user id across payload shapes
function getUserId(req) {
  return req.user?._id || req.user?.userId || req.user?.id;
}

router.get('/:month', auth, async (req, res) => {
  const { month } = req.params; // "YYYY-MM"

  try {
    const [year, rawMonth] = month.split('-');
    const start = new Date(`${year}-${rawMonth}-01T00:00:00Z`);
    const end = new Date(start);
    end.setMonth(end.getMonth() + 1);

    const [tasks, appointments, events] = await Promise.all([
      Task.find({
        userId: getUserId(req),
        dueDate: { $gte: `${year}-${rawMonth}-01`, $lt: `${end.getFullYear()}-${String(end.getMonth()+1).padStart(2,'0')}-01` },
      }).lean(),
      Appointment.find({
        userId: getUserId(req),
        date: { $gte: `${year}-${rawMonth}-01`, $lt: `${end.getFullYear()}-${String(end.getMonth()+1).padStart(2,'0')}-01` },
      }).lean(),
      ImportantEvent.find({
        userId: getUserId(req),
        date: { $regex: `^${year}-` }, // year filter; frontend can narrow by month if needed
      }).lean(),
    ]);

    res.json({ tasks, appointments, importantEvents: events });
  } catch (err) {
    console.error('❌ Calendar fetch error:', err);
    res.status(500).json({ error: 'Failed to load calendar data' });
  }
});

export default router;
