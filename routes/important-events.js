// routes/important-events.js
import express from 'express';
import auth from '../middleware/auth.js';
import ImportantEvent from '../models/ImportantEvent.js';

const router = express.Router();
router.use(auth);

function getUserId(req) {
  return req.user?.userId || req.user?._id || req.user?.id;
}

/** POST /api/important-events  { title, date, cluster?, entryId? } */
router.post('/', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { title, date, cluster = '', entryId = null } = req.body || {};
    if (!title || !date) return res.status(400).json({ error: 'title and date are required' });

    const doc = await ImportantEvent.create({
      userId,
      title: String(title),
      date: String(date),
      cluster: cluster ? String(cluster) : undefined,
      entryId: entryId || undefined
    });
    res.status(201).json(doc);
  } catch (e) {
    console.error('create important event error', e);
    res.status(500).json({ error: 'Failed to create important event' });
  }
});

/** (optional) GET /api/important-events/:id */
router.get('/:id', async (req, res) => {
  try {
    const doc = await ImportantEvent.findOne({ _id: req.params.id, userId: getUserId(req) });
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json(doc);
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch important event' });
  }
});

/** (optional) PATCH /api/important-events/:id */
router.patch('/:id', async (req, res) => {
  try {
    const allowed = ['title', 'date', 'cluster', 'entryId'];
    const update = {};
    for (const k of allowed) if (k in req.body) update[k] = req.body[k];

    const doc = await ImportantEvent.findOneAndUpdate(
      { _id: req.params.id, userId: getUserId(req) },
      update,
      { new: true }
    );
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json(doc);
  } catch (e) {
    res.status(500).json({ error: 'Failed to update important event' });
  }
});

/** (optional) DELETE /api/important-events/:id */
router.delete('/:id', async (req, res) => {
  try {
    const out = await ImportantEvent.deleteOne({ _id: req.params.id, userId: getUserId(req) });
    if (out.deletedCount === 0) return res.status(404).json({ error: 'Not found' });
    res.sendStatus(204);
  } catch (e) {
    res.status(500).json({ error: 'Failed to delete important event' });
  }
});

export default router;
