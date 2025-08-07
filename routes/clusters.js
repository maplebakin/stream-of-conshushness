import express from 'express';
import auth from '../middleware/auth.js';

const router = express.Router();

// Temporary in-memory clusters store (replace with DB later)
let clusters = [
  { id: '1', name: 'Home', description: 'Household tasks & projects', tasks: [] },
  { id: '2', name: 'Work', description: 'Work-related tasks & notes', tasks: [] }
];

// GET /api/clusters/:id
router.get('/:id', auth, (req, res) => {
  const cluster = clusters.find(c => c.id === req.params.id);
  if (!cluster) {
    return res.status(404).json({ error: 'Cluster not found' });
  }
  res.json(cluster);
});

// (Optional) GET /api/clusters - list all
router.get('/', auth, (req, res) => {
  res.json(clusters);
});

export default router;
