// backend/routes/clusters.js
import express from 'express';
import auth from '../middleware/auth.js';
import Cluster from '../models/Cluster.js';

const router = express.Router();
router.use(auth);

// GET /api/clusters
router.get('/', async (req, res) => {
  try {
    const clusters = await Cluster.find({ userId: req.user.userId, archived: { $ne: true } })
      .sort({ updatedAt: -1 });
    res.json(clusters);
  } catch (e) { res.status(500).json({ error: 'Failed to fetch clusters' }); }
});

// POST /api/clusters
router.post('/', async (req, res) => {
  try {
    const { name, color } = req.body;
    const cluster = await Cluster.create({ userId: req.user.userId, name, color });
    res.status(201).json(cluster);
  } catch (e) { res.status(400).json({ error: 'Failed to create cluster', detail: e.message }); }
});

// PATCH /api/clusters/:id
router.patch('/:id', async (req, res) => {
  try {
    const { name, color, archived } = req.body;
    const cluster = await Cluster.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.userId },
      { $set: { ...(name!=null && {name}), ...(color!=null && {color}), ...(archived!=null && {archived}) } },
      { new: true }
    );
    if (!cluster) return res.status(404).json({ error: 'Not found' });
    res.json(cluster);
  } catch (e) { res.status(400).json({ error: 'Failed to update cluster' }); }
});

// DELETE /api/clusters/:id (hard delete — or use archive via PATCH)
router.delete('/:id', async (req, res) => {
  try {
    const r = await Cluster.deleteOne({ _id: req.params.id, userId: req.user.userId });
    res.json({ ok: true, deleted: r.deletedCount });
  } catch (e) { res.status(400).json({ error: 'Failed to delete cluster' }); }
});

export default router;
