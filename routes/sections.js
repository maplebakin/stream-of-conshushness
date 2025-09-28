import express from 'express';
import mongoose from 'mongoose';
import Section from '../models/Section.js';

const router = express.Router();

const ALLOWED_LAYOUTS = new Set(['flow', 'grid', 'kanban', 'tree']);

function getUserId(req) {
  return req.user?.userId || req.user?._id || req.user?.id || null;
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
  const title = base.title || base.label || base.name || '';
  const slug = base.slug || base.key || '';
  const icon = base.icon ?? base.emoji ?? '';
  const theme = base.theme && typeof base.theme === 'object' ? base.theme : {};
  const ownerId = base.ownerId || base.userId || null;
  const userId = base.userId || base.ownerId || null;

  return {
    ...base,
    id: base._id?.toString?.() || base._id,
    ownerId,
    userId,
    title,
    label: title,
    name: title,
    slug,
    key: slug,
    icon,
    emoji: icon,
    theme,
  };
}

function buildOwnerFilter(ownerId) {
  if (!ownerId) return null;
  const clauses = [];
  clauses.push({ ownerId });
  clauses.push({ userId: ownerId });
  return { $or: clauses };
}

function buildIdentifierFilter(raw) {
  if (!raw) return null;

  const clauses = [];

  if (mongoose.Types.ObjectId.isValid(raw)) {
    clauses.push({ _id: raw });
  }

  const asString = String(raw);
  clauses.push({ slug: asString });
  clauses.push({ key: asString });

  const normalized = sanitizeSlug(asString);
  if (normalized && normalized !== asString) {
    clauses.push({ slug: normalized });
    clauses.push({ key: normalized });
  }

  if (!clauses.length) return null;
  return { $or: clauses };
}

function combineFilters(...clauses) {
  const filtered = clauses.filter(Boolean);
  if (!filtered.length) return {};
  if (filtered.length === 1) return filtered[0];
  return { $and: filtered };
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
      userId: ownerId,
      title,
      label: title,
      slug,
      key: slug,
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

    const ownerFilter = buildOwnerFilter(requestedOwnerId) || { ownerId: requestedOwnerId };
    const list = await Section.find(ownerFilter)
      .sort({ updatedAt: -1, _id: -1 })
      .lean();

    res.json(list.map(shapeSection));
  } catch (err) {
    console.error('GET /api/sections error:', err);
    res.status(500).json({ error: 'Failed to fetch sections' });
  }
});

// GET /api/sections/:id
router.get('/:id', async (req, res) => {
  try {
    const ownerId = getUserId(req);
    if (!ownerId) return res.status(401).json({ error: 'Unauthorized' });

    const identifierFilter = buildIdentifierFilter(req.params.id);
    if (!identifierFilter) return res.status(404).json({ error: 'Section not found' });
    const ownerFilter = buildOwnerFilter(ownerId) || { ownerId };
    const match = combineFilters(ownerFilter, identifierFilter);

    const doc = await Section.findOne(match);
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
      update.label = title;
    }

    if ('slug' in req.body) {
      const slug = sanitizeSlug(req.body.slug || '');
      if (!slug) return res.status(400).json({ error: 'slug cannot be empty' });
      update.slug = slug;
      update.key = slug;
    }

    if ('description' in req.body) {
      update.description = typeof req.body.description === 'string' ? req.body.description : '';
    }

    if ('icon' in req.body) {
      const icon = typeof req.body.icon === 'string' ? req.body.icon : '';
      update.icon = icon;
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

    update.ownerId = ownerId;
    update.userId = ownerId;

    const identifierFilter = buildIdentifierFilter(req.params.id);
    if (!identifierFilter) return res.status(404).json({ error: 'Section not found' });
    const ownerFilter = buildOwnerFilter(ownerId) || { ownerId };
    const match = combineFilters(ownerFilter, identifierFilter);

    const doc = await Section.findOneAndUpdate(match, update, { new: true, runValidators: true });

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

    const identifierFilter = buildIdentifierFilter(req.params.id);
    if (!identifierFilter) return res.status(404).json({ error: 'Section not found' });
    const ownerFilter = buildOwnerFilter(ownerId) || { ownerId };
    const match = combineFilters(ownerFilter, identifierFilter);

    const result = await Section.deleteOne(match);
    if (result.deletedCount === 0) return res.status(404).json({ error: 'Section not found' });

    res.sendStatus(204);
  } catch (err) {
    console.error('DELETE /api/sections/:id error:', err);
    res.status(500).json({ error: 'Failed to delete section' });
  }
});

export default router;
