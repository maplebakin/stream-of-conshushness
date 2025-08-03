import express from 'express';
import auth from '../middleware/auth.js';
import Todo from '../models/Todo.js'; // make sure this model exists

const router = express.Router();

// Save or update todos for a given date
router.post('/:date', auth, async (req, res) => {
  try {
    const { date } = req.params;
    const { items } = req.body;

    if (!Array.isArray(items)) {
      return res.status(400).json({ error: 'Invalid items format' });
    }

    const existing = await Todo.findOne({ userId: req.user.userId, date });

    if (existing) {
      existing.items = items;
      await existing.save();
      res.json(existing);
    } else {
      const newTodo = new Todo({ userId: req.user.userId, date, items });
      await newTodo.save();
      res.json(newTodo);
    }
  } catch (err) {
    console.error('❌ Error saving todos:', err);
    res.status(500).json({ error: 'Server error saving todos' });
  }
});

export default router;
