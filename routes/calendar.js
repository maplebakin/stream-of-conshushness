import express from 'express';
import auth from '../middleware/auth.js';
import Task from '../models/Task.js';
import Appointment from '../models/Appointment.js';
import ImportantEvent from '../models/ImportantEvent.js';

const router = express.Router();

router.get('/:month', auth, async (req, res) => {
  const { month } = req.params; // "YYYY-MM"

  try {
    const [year, rawMonth] = month.split('-');
    const start = new Date(`${year}-${rawMonth}-01T00:00:00Z`);
    const end = new Date(start);
    end.setMonth(end.getMonth() + 1);

    const [tasks, appointments, events] = await Promise.all([
      Task.find({
        userId: req.user._id,
        dueDate: { $gte: start, $lt: end }
      }),
      Appointment.find({
        userId: req.user._id,
        date: { $gte: `${month}-01`, $lt: `${month}-32` } // Appointments store date as string
      }),
      ImportantEvent.find({
        userId: req.user._id,
        date: { $gte: `${month}-01`, $lt: `${month}-32` } // Also strings
      }),
    ]);

    res.json({
      tasks,
      appointments,
      importantEvents: events,
    });
  } catch (err) {
    console.error('❌ Calendar fetch error:', err);
    res.status(500).json({ error: 'Failed to load calendar data' });
  }
});

export default router;
