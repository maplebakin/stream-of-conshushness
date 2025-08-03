import express from 'express';
import Ripple from '../models/Ripple.js';
import auth from '../middleware/auth.js';

const router = express.Router();

// Get ripples by date
router.get('/:date', auth, async (req, res) => {
  try {
    const ripples = await Ripple.find({
      userId: req.user.userId,
      extractedAt: { $regex: `^${req.params.date}` }
    }).sort({ confidence: -1 });
    res.json(ripples);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch ripples' });
  }
});

export default router;
