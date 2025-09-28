// routes/sections.js
import express from 'express';
import mongoose from 'mongoose';
import Entry from '../models/Entry.js';
import Section from '../models/Section.js';
import Task from '../models/Task.js';

const router = express.Router();

const ALLOWED_LAYOUTS = new Set(['flow', 'grid', 'kanban', 'tree']);

function getUserId(req) {
  return req.user?.userId || req.user?._id || req.user?.id || null;
}

function toObjectId(value) {
  if (!value) return null;
  if (value instanceof mongoose.Types.ObjectId) return value;
  if (typeof value === 'string') {
    if (!mongoose.Types.ObjectId.isValid(value)) return null;
    return new mongoose.Types.ObjectId(value);
  }
  if (value && typeof value === 'object' && value._id) {
    return toObjectId(value._id);
  }
  return null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function parseWindow(value) {
  if (value == null) return 7 * DAY_MS;
  const str = String(value).trim();
  if (!str) return 7 * DAY_MS;

  const match = str.match(/^(\d+)(?:\s*(d|day|days|h|hour|hours))?$/i);
  if (!match) return null;

  const amount = Number.parseInt(match[1], 10);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const unit = (match[2] || 'd').toLowerCase();
  const multiplier = unit.startsWith('h') ? 60 * 60 * 1000 : DAY_MS;

  return amount * multiplier;
}

function sanitizeSlug(str) {
  const base = String(str || '').toLowerCase().trim();
  return base
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function parseTheme(raw) {
  if (raw == null) return undefined;
  if (typeof raw === 'string') {
    if (!raw.trim()) return undefined;
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
      throw new Error('Theme must be a JSON object');
    } catch (err) {
      throw new Error('Theme must be valid JSON');
    }
  }
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  throw new Error('Theme must be an object');
}

function normalizeLayout(value) {
  if (!value) return undefined;
  const normalized = String(value).toLowerCase();
  if (ALLOWED_LAYOUTS.has(normalized)) return normalized;
  throw new Error(`Layout must be one of: ${Array.from(ALLOWED_LAYOUTS).join(', ')}`);
}

function shapeSection(doc) {
  const base = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  return {
    ...base,
    id: base._id?.toString?.() || base._id,
    key: base.slug,
    label: base.title,
    name: base.title,
    emoji: base.icon,
  };
}

// POST /api/sections
router.post('/', async (req, res) => {
  try {
    const ownerId = getUserId(req);
    if (!ownerId) return res.status(401).json({ error: 'Unauthorized' });

    const title = String(req.body?.title || '').trim();
    if (!title) return res.status(400).json({ error: 'title is required' });

    let slug = sanitizeSlug(req.body?.slug || '');
    if (!slug) {
      slug = sanitizeSlug(title);
    }
    if (!slug) return res.status(400).json({ error: 'slug is required' });

    const description = typeof req.body?.description === 'string' ? req.body.description : '';
    const icon = typeof req.body?.icon === 'string' ? req.body.icon : '';
    const isPublic = Boolean(req.body?.public);

    let theme;
    try {
      theme = parseTheme(req.body?.theme);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    let layout;
    try {
      layout = normalizeLayout(req.body?.layout);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    const payload = {
      ownerId,
      title,
      slug,
      description,
      icon,
      public: isPublic,
    };
    if (theme !== undefined) payload.theme = theme;
    if (layout) payload.layout = layout;

    const doc = await Section.create(payload);
    res.status(201).json(shapeSection(doc));
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ error: 'Section slug already exists for this owner' });
    }
    console.error('POST /api/sections error:', err);
    res.status(500).json({ error: 'Failed to create section' });
  }
});

// GET /api/sections
router.get('/', async (req, res) => {
  try {
    const currentUserId = getUserId(req);
    if (!currentUserId) return res.status(401).json({ error: 'Unauthorized' });

    const requestedOwnerId = req.query.ownerId || currentUserId;
    if (String(requestedOwnerId) !== String(currentUserId)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const list = await Section.find({ ownerId: requestedOwnerId })
      .sort({ updatedAt: -1, _id: -1 })
      .lean();

    res.json(list.map(shapeSection));
  } catch (err) {
    console.error('GET /api/sections error:', err);
    res.status(500).json({ error: 'Failed to fetch sections' });
  }
});

// GET /api/sections/activity
router.get('/activity', async (req, res) => {
  try {
    const ownerId = getUserId(req);
    if (!ownerId) return res.status(401).json({ error: 'Unauthorized' });

    const ownerObjectId = toObjectId(ownerId);
    if (!ownerObjectId) return res.status(400).json({ error: 'Invalid user id' });

    const windowRaw = req.query.window;
    const windowMs = parseWindow(windowRaw);
    if (windowMs == null) {
      return res.status(400).json({ error: 'Invalid window parameter' });
    }

    const since = new Date(Date.now() - windowMs);

    const sections = await Section.find({ ownerId: ownerObjectId }).select('slug').lean();
    if (!sections.length) {
      return res.json({
        window: { raw: windowRaw ?? '7d', ms: windowMs, since: since.toISOString() },
        activity: {},
      });
    }

    const slugs = sections.map((section) => section.slug).filter(Boolean);
    if (!slugs.length) {
      return res.json({
        window: { raw: windowRaw ?? '7d', ms: windowMs, since: since.toISOString() },
        activity: {},
      });
    }

    const activityMap = Object.create(null);
    for (const slug of slugs) {
      activityMap[slug] = { entries: 0, tasks: 0, total: 0 };
    }

    const entriesActivity = await Entry.aggregate([
      {
        $match: {
          userId: ownerObjectId,
          section: { $in: slugs },
          updatedAt: { $gte: since },
        },
      },
      {
        $group: {
          _id: '$section',
          count: { $sum: 1 },
        },
      },
    ]);

    for (const item of entriesActivity) {
      const slug = item?._id;
      if (slug && activityMap[slug]) {
        activityMap[slug].entries = item.count || 0;
      }
    }

    const tasksActivity = await Task.aggregate([
      {
        $match: {
          userId: ownerObjectId,
          sections: { $in: slugs },
          updatedAt: { $gte: since },
        },
      },
      { $unwind: '$sections' },
      { $match: { sections: { $in: slugs } } },
      {
        $group: {
          _id: '$sections',
          count: { $sum: 1 },
        },
      },
    ]);

    for (const item of tasksActivity) {
      const slug = item?._id;
      if (slug && activityMap[slug]) {
        activityMap[slug].tasks = item.count || 0;
      }
    }

    for (const slug of Object.keys(activityMap)) {
      const stats = activityMap[slug];
      stats.total = (stats.entries || 0) + (stats.tasks || 0);
    }

    res.json({
      window: { raw: windowRaw ?? '7d', ms: windowMs, since: since.toISOString() },
      activity: activityMap,
    });
  } catch (err) {
    console.error('GET /api/sections/activity error:', err);
    res.status(500).json({ error: 'Failed to fetch section activity' });
  }
});

// GET /api/sections/:id
router.get('/:id', async (req, res) => {
  try {
    const ownerId = getUserId(req);
    if (!ownerId) return res.status(401).json({ error: 'Unauthorized' });

    const doc = await Section.findOne({ _id: req.params.id, ownerId });
    if (!doc) return res.status(404).json({ error: 'Section not found' });

    res.json(shapeSection(doc));
  } catch (err) {
    console.error('GET /api/sections/:id error:', err);
    res.status(500).json({ error: 'Failed to fetch section' });
  }
});

// PUT /api/sections/:id
router.put('/:id', async (req, res) => {
  try {
    const ownerId = getUserId(req);
    if (!ownerId) return res.status(401).json({ error: 'Unauthorized' });

    const update = {};

    if ('title' in req.body) {
      const title = String(req.body.title || '').trim();
      if (!title) return res.status(400).json({ error: 'title cannot be empty' });
      update.title = title;
    }

    if ('slug' in req.body) {
      const slug = sanitizeSlug(req.body.slug || '');
      if (!slug) return res.status(400).json({ error: 'slug cannot be empty' });
      update.slug = slug;
    }

    if ('description' in req.body) {
      update.description = typeof req.body.description === 'string' ? req.body.description : '';
    }

    if ('icon' in req.body) {
      update.icon = typeof req.body.icon === 'string' ? req.body.icon : '';
    }

    if ('public' in req.body) {
      update.public = Boolean(req.body.public);
    }

    if ('theme' in req.body) {
      try {
        const theme = parseTheme(req.body.theme);
        if (theme !== undefined) {
          update.theme = theme;
        } else {
          update.theme = {};
        }
      } catch (err) {
        return res.status(400).json({ error: err.message });
      }
    }

    if ('layout' in req.body) {
      try {
        const layout = normalizeLayout(req.body.layout);
        update.layout = layout || 'flow';
      } catch (err) {
        return res.status(400).json({ error: err.message });
      }
    }

    if (!Object.keys(update).length) {
      return res.status(400).json({ error: 'No updates supplied' });
    }

    const doc = await Section.findOneAndUpdate(
      { _id: req.params.id, ownerId },
      update,
      { new: true, runValidators: true }
    );

    if (!doc) return res.status(404).json({ error: 'Section not found' });

    res.json(shapeSection(doc));
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ error: 'Section slug already exists for this owner' });
    }
    console.error('PUT /api/sections/:id error:', err);
    res.status(500).json({ error: 'Failed to update section' });
  }
});

// DELETE /api/sections/:id
router.delete('/:id', async (req, res) => {
  try {
    const ownerId = getUserId(req);
    if (!ownerId) return res.status(401).json({ error: 'Unauthorized' });

    const result = await Section.deleteOne({ _id: req.params.id, ownerId });
    if (result.deletedCount === 0) return res.status(404).json({ error: 'Section not found' });

    res.sendStatus(204);
  } catch (err) {
    console.error('DELETE /api/sections/:id error:', err);
    res.status(500).json({ error: 'Failed to delete section' });
  }
});

export default router;
