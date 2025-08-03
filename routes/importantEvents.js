import express from 'express';
import ImportantEvent from '../models/ImportantEvent.js';
import auth from '../middleware/auth.js';

const router = express.Router();

// GET: fetch all events for a given YYYY-MM
router.get('/:yearMonth', auth, async (req, res) => {
  const { yearMonth } = req.params;
  const regex = new RegExp(`^${yearMonth}`); // Matches YYYY-MM-DD
  try {
    const events = await ImportantEvent.find({
      userId: req.user.userId,
      date: { $regex: regex },
    }).sort({ date: 1 });
    res.json(events);
  } catch (err) {
    console.error('Error fetching events:', err);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

// POST: create a new event
router.post('/', auth, async (req, res) => {
  const { date, title, description } = req.body;
  if (!date || !title) {
    return res.status(400).json({ error: 'Date and title are required' });
  }

  try {
    const event = new ImportantEvent({
      userId: req.user.userId,
      date,
      title,
      description,
    });
    await event.save();
    res.status(201).json(event);
  } catch (err) {
    console.error('Error saving important event:', err);
    res.status(500).json({ error: 'Failed to create important event' });
  }
});

// DELETE: delete a single event by ID
router.delete('/:id', auth, async (req, res) => {
  try {
    const deleted = await ImportantEvent.findOneAndDelete({
      _id: req.params.id,
      userId: req.user.userId,
    });
    if (!deleted) {
      return res.status(404).json({ error: 'Event not found or not yours' });
    }
    res.json({ success: true, deletedId: deleted._id });
  } catch (err) {
    console.error('Error deleting event:', err);
    res.status(500).json({ error: 'Failed to delete event' });
  }
});

export default router;
