// routes/research.js  — genealogy/research project management
import { Router } from 'express';
import mongoose from 'mongoose';
import ResearchSubject from '../models/ResearchSubject.js';
import Section from '../models/Section.js';
import { logSafeError } from '../utils/errorHandler.js';

const { ObjectId } = mongoose.Types;
const r = Router();

// ─── helpers ──────────────────────────────────────────────────────────────────

function slugify(name) {
  return String(name)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function uniqueSlug(userId, sectionId, base) {
  let slug = base || 'subject';
  let n = 0;
  while (await ResearchSubject.exists({ userId, sectionId, slug })) {
    n += 1;
    slug = `${base}-${n}`;
  }
  return slug;
}

async function resolveSection(userId, key) {
  if (ObjectId.isValid(key)) {
    return Section.findOne({ _id: key, ownerId: userId }).lean();
  }
  return Section.findOne({ ownerId: userId, slug: key }).lean();
}

async function resolveOwnedRelationshipIds(userId, sectionId, values) {
  const raw = [...new Set((Array.isArray(values) ? values : []).filter(Boolean).map(String))];
  const requested = raw.filter((id) => ObjectId.isValid(id));
  if (!requested.length) return { ids: [], allOwned: raw.length === 0 };

  const rows = await ResearchSubject.find({
    _id: { $in: requested },
    userId,
    sectionId,
  }).select('_id').lean();
  const ids = (rows || []).map((row) => row._id);
  return { ids, allOwned: requested.length === raw.length && ids.length === requested.length };
}

// ─── List subjects in a research section ──────────────────────────────────────
// GET /api/research/:sectionKey/subjects[?q=]
r.get('/:sectionKey/subjects', async (req, res) => {
  try {
    const userId = req.user.userId;
    const section = await resolveSection(userId, req.params.sectionKey);
    if (!section) return res.status(404).json({ error: 'Section not found' });

    const filter = { userId, sectionId: section._id };
    if (req.query.q) {
      const re = new RegExp(String(req.query.q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ name: re }, { alternateNames: re }, { tags: re }];
    }

    const subjects = await ResearchSubject.find(filter)
      .sort({ name: 1 })
      .lean();

    return res.json({ subjects, sectionId: section._id });
  } catch (e) {
    logSafeError('research list failed', e);
    return res.status(500).json({ error: 'Failed to list subjects' });
  }
});

// ─── Create subject ────────────────────────────────────────────────────────────
// POST /api/research/:sectionKey/subjects
r.post('/:sectionKey/subjects', async (req, res) => {
  try {
    const userId = req.user.userId;
    const section = await resolveSection(userId, req.params.sectionKey);
    if (!section) return res.status(404).json({ error: 'Section not found' });

    const {
      name = '',
      gender = '',
      alternateNames = [],
      birthDate = '', birthPlace = '',
      deathDate = '', deathPlace = '',
      burialPlace = '',
      occupation = '',
      parentIds = [],
      spouseIds = [],
      notes = '',
      sources = [],
      tags = [],
    } = req.body || {};

    if (!name.trim()) return res.status(400).json({ error: 'name required' });

    const base = slugify(name);
    const slug = await uniqueSlug(userId, section._id, base);
    const [ownedParents, ownedSpouses] = await Promise.all([
      resolveOwnedRelationshipIds(userId, section._id, parentIds),
      resolveOwnedRelationshipIds(userId, section._id, spouseIds),
    ]);
    if (!ownedParents.allOwned || !ownedSpouses.allOwned) {
      return res.status(400).json({ error: 'Relationships must reference subjects in this research section' });
    }

    const subject = await ResearchSubject.create({
      userId,
      sectionId: section._id,
      name: name.trim().slice(0, 300),
      slug,
      gender,
      alternateNames: (Array.isArray(alternateNames) ? alternateNames : []).map(n => String(n).trim()).filter(Boolean),
      birthDate: String(birthDate).trim(),
      birthPlace: String(birthPlace).trim(),
      deathDate: String(deathDate).trim(),
      deathPlace: String(deathPlace).trim(),
      burialPlace: String(burialPlace).trim(),
      occupation: String(occupation).trim(),
      parentIds: ownedParents.ids,
      spouseIds: ownedSpouses.ids,
      notes: String(notes).slice(0, 50000),
      sources: (Array.isArray(sources) ? sources : []).slice(0, 50).map(s => ({
        citation: String(s.citation || '').trim(),
        url: String(s.url || '').trim(),
        reliability: ['primary', 'secondary', 'tertiary', 'unknown'].includes(s.reliability)
          ? s.reliability : 'unknown',
      })),
      tags: (Array.isArray(tags) ? tags : []).map(t => String(t).trim()).filter(Boolean),
    });

    return res.status(201).json({ subject });
  } catch (e) {
    logSafeError('research create failed', e);
    return res.status(500).json({ error: 'Failed to create subject' });
  }
});

// ─── Get one subject (with populated relationships) ───────────────────────────
// GET /api/research/:sectionKey/subjects/:id
r.get('/:sectionKey/subjects/:id', async (req, res) => {
  try {
    const userId = req.user.userId;
    const section = await resolveSection(userId, req.params.sectionKey);
    if (!section) return res.status(404).json({ error: 'Section not found' });

    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: 'Invalid id' });

    const subject = await ResearchSubject.findOne({
      _id: req.params.id,
      userId,
      sectionId: section._id,
    })
      .populate({
        path: 'parentIds',
        select: 'name slug birthDate deathDate gender',
        match: { userId, sectionId: section._id },
      })
      .populate({
        path: 'spouseIds',
        select: 'name slug birthDate deathDate gender',
        match: { userId, sectionId: section._id },
      })
      .lean();

    if (!subject) return res.status(404).json({ error: 'Subject not found' });

    // Derive children: subjects that have this subject in their parentIds
    const children = await ResearchSubject.find({
      userId,
      sectionId: section._id,
      parentIds: subject._id,
    }).select('name slug birthDate deathDate gender').lean();

    return res.json({ subject: { ...subject, children } });
  } catch (e) {
    logSafeError('research get failed', e);
    return res.status(500).json({ error: 'Failed to get subject' });
  }
});

// ─── Update subject ────────────────────────────────────────────────────────────
// PATCH /api/research/:sectionKey/subjects/:id
r.patch('/:sectionKey/subjects/:id', async (req, res) => {
  try {
    const userId = req.user.userId;
    const section = await resolveSection(userId, req.params.sectionKey);
    if (!section) return res.status(404).json({ error: 'Section not found' });

    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: 'Invalid id' });

    const allowed = [
      'name', 'gender', 'alternateNames',
      'birthDate', 'birthPlace', 'deathDate', 'deathPlace', 'burialPlace',
      'occupation', 'parentIds', 'spouseIds',
      'notes', 'sources', 'tags',
    ];

    const updates = {};
    for (const key of allowed) {
      if (key in req.body) updates[key] = req.body[key];
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'name')) {
      updates.name = String(updates.name || '').trim().slice(0, 300);
      if (!updates.name) return res.status(400).json({ error: 'name required' });
    }
    if (updates.parentIds) {
      const owned = await resolveOwnedRelationshipIds(userId, section._id, updates.parentIds);
      if (!owned.allOwned) {
        return res.status(400).json({ error: 'Parents must belong to this research section' });
      }
      updates.parentIds = owned.ids;
    }
    if (updates.spouseIds) {
      const owned = await resolveOwnedRelationshipIds(userId, section._id, updates.spouseIds);
      if (!owned.allOwned) {
        return res.status(400).json({ error: 'Spouses must belong to this research section' });
      }
      updates.spouseIds = owned.ids;
    }
    if (updates.sources) {
      updates.sources = (Array.isArray(updates.sources) ? updates.sources : []).slice(0, 50).map(s => ({
        citation: String(s.citation || '').trim(),
        url: String(s.url || '').trim(),
        reliability: ['primary', 'secondary', 'tertiary', 'unknown'].includes(s.reliability)
          ? s.reliability : 'unknown',
      }));
    }
    if (updates.tags) {
      updates.tags = (Array.isArray(updates.tags) ? updates.tags : []).map(t => String(t).trim()).filter(Boolean);
    }
    if (updates.alternateNames) {
      updates.alternateNames = (Array.isArray(updates.alternateNames) ? updates.alternateNames : [])
        .map(n => String(n).trim()).filter(Boolean);
    }
    if (!Object.keys(updates).length) {
      return res.status(400).json({ error: 'No valid updates provided' });
    }

    const subject = await ResearchSubject.findOneAndUpdate(
      { _id: req.params.id, userId, sectionId: section._id },
      { $set: updates },
      { new: true, runValidators: true }
    ).lean();

    if (!subject) return res.status(404).json({ error: 'Subject not found' });
    return res.json({ subject });
  } catch (e) {
    logSafeError('research update failed', e);
    return res.status(500).json({ error: 'Failed to update subject' });
  }
});

// ─── Delete subject ────────────────────────────────────────────────────────────
// DELETE /api/research/:sectionKey/subjects/:id
r.delete('/:sectionKey/subjects/:id', async (req, res) => {
  try {
    const userId = req.user.userId;
    const section = await resolveSection(userId, req.params.sectionKey);
    if (!section) return res.status(404).json({ error: 'Section not found' });

    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: 'Invalid id' });

    const subject = await ResearchSubject.findOne({
      _id: req.params.id,
      userId,
      sectionId: section._id,
    }).lean();

    if (!subject) return res.status(404).json({ error: 'Subject not found' });

    // Clean relationships while the owned subject still exists. If cleanup
    // fails, deletion does not leave every related record dangling.
    await ResearchSubject.updateMany(
      { userId, sectionId: section._id, _id: { $ne: subject._id } },
      { $pull: { parentIds: subject._id, spouseIds: subject._id } }
    );

    const deleted = await ResearchSubject.findOneAndDelete({
      _id: subject._id,
      userId,
      sectionId: section._id,
    }).lean();
    if (!deleted) return res.status(409).json({ error: 'Subject changed while it was being deleted' });

    return res.json({ ok: true });
  } catch (e) {
    logSafeError('research delete failed', e);
    return res.status(500).json({ error: 'Failed to delete subject' });
  }
});

export default r;
