// routes/entries.js
import express from 'express';
import Entry from '../models/Entry.js';
import Ripple from '../models/Ripple.js';
import auth from '../middleware/auth.js';
import { analyzeEntry } from '../utils/analyzeEntry.js'; // ← NEW

const router = express.Router();
router.use(auth);

/* YYYY-MM-DD in America/Toronto */
function todayISOInToronto() {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric', month: '2-digit', day: '2-digit'
  });
  const p = fmt.formatToParts(new Date());
  const y = p.find(x => x.type === 'year').value;
  const m = p.find(x => x.type === 'month').value;
  const d = p.find(x => x.type === 'day').value;
  return `${y}-${m}-${d}`;
}

/* Normalize user id from JWT */
function getUserId(req) {
  return req.user?.userId || req.user?._id || req.user?.id;
}

/* ───────────────────────── GET /api/entries (optional filters) ─────────────────────────
   Query: ?cluster=Home  or  ?section=Games  (both are optional)
--------------------------------------------------------------------------------------- */
router.get('/', async (req, res) => {
  try {
    const q = { userId: getUserId(req) };
    if (req.query.cluster) q.cluster = req.query.cluster;
    if (req.query.section) q.section = req.query.section;

    const entries = await Entry.find(q).sort({ date: -1, createdAt: -1 });
    res.json(entries);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch entries' });
  }
});

/* ───────────────────────── GET /api/entries/:date ─────────────────────────
   Return entries for a specific day (YYYY-MM-DD)
--------------------------------------------------------------------------- */
router.get('/:date', async (req, res) => {
  try {
    const entries = await Entry.find({
      userId: getUserId(req),
      date: req.params.date
    }).sort({ createdAt: -1 });
    res.json(entries);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch entries by date' });
  }
});

/* ───────────────────────── POST /api/entries ─────────────────────────
   Create an entry, then analyze it to insert pending Ripples.
   Body accepts: { date?, text?, html?, content?, mood?, cluster?, tags?, linkedGoal? }
--------------------------------------------------------------------------- */
router.post('/', async (req, res) => {
  try {
    const userId = getUserId(req);

    // accept explicit date or default to "today" in Toronto
    const entryDate = (req.body?.date && String(req.body.date)) || todayISOInToronto();

    // support legacy "content" and prefer "text" if present
    const textField =
      (typeof req.body?.text === 'string' && req.body.text) ||
      (typeof req.body?.content === 'string' && req.body.content) ||
      '';

    const html = String(req.body?.html || '');
    const mood = String(req.body?.mood || '');
    const cluster = String(req.body?.cluster || '');
    const tags = Array.isArray(req.body?.tags) ? req.body.tags : [];
    const linkedGoal = req.body?.linkedGoal ?? null;

    // 1) Create the entry
    const doc = await Entry.create({
      userId,
      date: entryDate,
      text: textField,
      html,
      mood,
      cluster,
      tags,
      linkedGoal
    });

    // 2) Analyze + extract ripple drafts (NEW)
    const { ripples } = analyzeEntry({
      text: textField,
      html,
      entryDate,
      userId,
      sourceEntryId: doc._id
    });

    // 3) Insert pending ripples (if any)
    if (Array.isArray(ripples) && ripples.length) {
      const drafts = ripples.map(r => {
        // default cluster from the entry if extractor didn't assign any
        const assigned = Array.isArray(r.assignedClusters) ? r.assignedClusters : [];
        const finalClusters = assigned.length ? assigned : (cluster ? [cluster] : []);
        return {
        userId,
        sourceEntryId: doc._id,
        entryDate,
        extractedText: r.extractedText,
        originalContext: r.originalContext || textField || '',
        type: r.type || 'suggestedTask',
        priority: r.priority || 'low',
         assignedClusters: finalClusters,
         assignedCluster: finalClusters[0] || null,
        dueDate: r.dueDate ?? null,
        recurrence: r.recurrence || r.repeat || null,
        status: 'pending'
      };
     });
      await Ripple.insertMany(drafts);
    }

    res.status(201).json(doc);
  } catch (err) {
    console.error('❌ Entry create failed:', err);
    res.status(500).json({ error: 'Failed to create entry' });
  }
});

/* ───────────────────────── PATCH /api/entries/:id ─────────────────────────
   Update entry fields (does not re-run analysis by default)
--------------------------------------------------------------------------- */
router.patch('/:id', async (req, res) => {
  try {
    const update = {};
    ['text','html','mood','cluster','tags','linkedGoal','date'].forEach(k => {
      if (k in req.body) update[k] = req.body[k];
    });

    const doc = await Entry.findOneAndUpdate(
      { _id: req.params.id, userId: getUserId(req) },
      update,
      { new: true }
    );
    if (!doc) return res.status(404).json({ error: 'Entry not found' });
    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update entry' });
  }
});

/* ───────────────────────── DELETE /api/entries/:id ───────────────────────── */
router.delete('/:id', async (req, res) => {
  try {
    const out = await Entry.deleteOne({ _id: req.params.id, userId: getUserId(req) });
    if (out.deletedCount === 0) return res.status(404).json({ error: 'Entry not found' });
    res.sendStatus(204);
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete entry' });
  }
});

export default router;
