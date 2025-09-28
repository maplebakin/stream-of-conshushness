import express from 'express';
import Cluster, { slugifyClusterSlug } from '../models/Cluster.js';

const router = express.Router();

function getOwnerId(req) {
  return req.user?.id;
}

router.get('/', async (req, res) => {
  try {
    const ownerId = getOwnerId(req);
    const clusters = await Cluster.find({ ownerId }).sort({ createdAt: 1 }).lean();
    res.json({ data: clusters });
  } catch (error) {
    console.error('List clusters error:', error);
    res.status(500).json({ error: 'Failed to list clusters' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const ownerId = getOwnerId(req);
    const cluster = await Cluster.findOne({ _id: req.params.id, ownerId }).lean();
    if (!cluster) {
      return res.status(404).json({ error: 'Cluster not found' });
    }
    res.json({ data: cluster });
  } catch (error) {
    console.error('Get cluster error:', error);
    res.status(500).json({ error: 'Failed to load cluster' });
  }
});

router.post('/', async (req, res) => {
  try {
    const ownerId = getOwnerId(req);
    const name = String(req.body?.name || '').trim();
    const slugInput = req.body?.slug || name;
    const slug = slugifyClusterSlug(slugInput);

    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }

    if (!slug) {
      return res.status(400).json({ error: 'slug is required' });
    }

    const existing = await Cluster.findOne({ ownerId, slug }).lean();
    if (existing) {
      return res.status(409).json({ error: 'Slug already in use' });
    }

    const cluster = await Cluster.create({
      ownerId,
      name,
      slug,
      color: req.body?.color || undefined,
      icon: req.body?.icon || undefined
    });

    res.status(201).json({ data: cluster });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ error: 'Slug already in use' });
    }
    console.error('Create cluster error:', error);
    res.status(500).json({ error: 'Failed to create cluster' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const ownerId = getOwnerId(req);
    const updates = {};

    if ('name' in req.body) {
      const name = String(req.body.name || '').trim();
      if (!name) {
        return res.status(400).json({ error: 'name is required' });
      }
      updates.name = name;
    }

    if ('slug' in req.body) {
      const slug = slugifyClusterSlug(req.body.slug);
      if (!slug) {
        return res.status(400).json({ error: 'slug is required' });
      }
      const duplicate = await Cluster.findOne({
        _id: { $ne: req.params.id },
        ownerId,
        slug
      }).lean();
      if (duplicate) {
        return res.status(409).json({ error: 'Slug already in use' });
      }
      updates.slug = slug;
    }

    if ('color' in req.body) {
      updates.color = req.body.color;
    }

    if ('icon' in req.body) {
      updates.icon = req.body.icon;
    }

    if (!Object.keys(updates).length) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    const cluster = await Cluster.findOneAndUpdate(
      { _id: req.params.id, ownerId },
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!cluster) {
      return res.status(404).json({ error: 'Cluster not found' });
    }

    res.json({ data: cluster });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ error: 'Slug already in use' });
    }
    console.error('Update cluster error:', error);
    res.status(500).json({ error: 'Failed to update cluster' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const ownerId = getOwnerId(req);
    const cluster = await Cluster.findOneAndDelete({ _id: req.params.id, ownerId });
    if (!cluster) {
      return res.status(404).json({ error: 'Cluster not found' });
    }
    res.json({ ok: true });
  } catch (error) {
    console.error('Delete cluster error:', error);
    res.status(500).json({ error: 'Failed to delete cluster' });
  }
});

export default router;
