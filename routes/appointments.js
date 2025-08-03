// routes/appointments.js
import express from 'express';
import Appointment from '../models/Appointment.js';
import auth from '../middleware/auth.js';

const router = express.Router();

// Get all appointments for a specific date
router.get('/:date', auth, async (req, res) => {
  try {
    const date = req.params.date; // e.g. '2025-08-01'
    const userId = req.user._id;

    const appointments = await Appointment.find({ userId, date });
    res.json(appointments);
  } catch (err) {
    console.error('❌ Failed to get appointments:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create a new appointment
router.post('/', auth, async (req, res) => {
  try {
    const { date, time, details, cluster, entryId } = req.body;
    const userId = req.user._id;

    const newAppt = new Appointment({
      userId,
      date,
      time,
      details,
      cluster,
      entryId
    });

    const saved = await newAppt.save();
    res.status(201).json(saved);
  } catch (err) {
    console.error('❌ Failed to create appointment:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete an appointment
router.delete('/:id', auth, async (req, res) => {
  try {
    const appt = await Appointment.findOneAndDelete({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!appt) return res.status(404).json({ error: 'Not found' });

    res.json({ success: true });
  } catch (err) {
    console.error('❌ Failed to delete appointment:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
