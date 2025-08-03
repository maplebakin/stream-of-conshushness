import express from 'express';
import auth from '../middleware/auth.js';

const router = express.Router();

// TEMP placeholder route to avoid 404s
router.get('/:yearMonth', auth, async (req, res) => {
  res.json([]); // return empty array for now
});

export default router;
