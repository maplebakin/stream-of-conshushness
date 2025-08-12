// backend/routes/entries.js
import express from 'express';
import Entry from '../models/Entry.js';
import auth from '../middleware/auth.js';

const router = express.Router();
router.use(auth);

/** YYYY-MM-DD (local-agnostic, safe fallback) */
function toISODateOnly(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Make a deduped, trimmed string array from various inputs */
function normalizeTags(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return Array.from(
      new Set(
        raw
          .map((s) => String(s).trim())
          .filter(Boolean)
      )
    );
  }
  // handle comma-separated string
  if (typeof raw === 'string') {
    return normalizeTags(
      raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    );
  }
  return [];
}

/** Derive plain text from html/content as a last resort */
function toPlainText({ text, html, content }) {
  if (typeof text === 'string' && text.trim().length) return text.trim();
  const src = typeof html === 'string' && html.trim().length
    ? html
    : typeof content === 'string'
      ? content
      : '';
  if (!src) return '';
  return src.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Parse date string 'YYYY-MM-DD' to comparable ms (local midnight). */
function dayMs(v) {
  if (!v || typeof v !== 'string') return -Infinity;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return -Infinity;
  const dt = new Date(+m[1], +m[2] - 1, +m[3]);
  return dt.getTime();
}

/** Sort newest first by date, then createdAt/ObjectId time */
function createdAtMs(e) {
  if (e?.createdAt) {
    const t = new Date(e.createdAt).getTime();
    if (!Number.isNaN(t)) return t;
  }
  if (e?._id && typeof e._id === 'string' && e._id.length >= 8) {
    const secs = parseInt(e._id.slice(0, 8), 16);
    if (!Number.isNaN(secs)) return secs * 1000;
  }
  return -Infinity;
}

function sortNewestFirst(a, b) {
  const da = dayMs(a.date);
  const db = dayMs(b.date);
  if (da !== db) return db - da;
  const ca = createdAtMs(a);
  const cb = createdAtMs(b);
  if (ca !== cb) return cb - ca;
  if (a._id && b._id && a._id !== b._id) return a._id < b._id ? 1 : -1;
  return 0;
}

/* ========================= Routes ========================= */

/** GET /api/entries  (optional ?section= or future filters) */
router.get('/', async (req, res) => {
  try {
    const { section } = req.query; // legacy allowance
    const query = { userId: req.user.userId };
    if (section) query.section = new RegExp(`^${section}$`, 'i');

    const entries = await Entry.find(query).lean();
    entries.sort(sortNewestFirst);
    res.json(entries);
  } catch (err) {
    console.error('GET /entries error:', err);
    res.status(500).json({ error: 'Failed to fetch entries' });
  }
});

/** GET /api/entries/:date (YYYY-MM-DD) */
router.get('/:date', async (req, res) => {
  try {
    const entries = await Entry.find({
      userId: req.user.userId,
      date: req.params.date,
    }).lean();
    entries.sort(sortNewestFirst);
    res.json(entries);
  } catch (err) {
    console.error('GET /entries/:date error:', err);
    res.status(500).json({ error: 'Failed to fetch entries by date' });
  }
});

/** POST /api/entries */
router.post('/', async (req, res) => {
  try {
    const {
      date,
      text,
      html = '',
      content = '',       // legacy
      mood = '',
      cluster = '',
      tags,               // can be undefined, string, or array
      linkedGoal = null,

      // allow suggested structures if sent (optional)
      suggestedTasks = [],
      suggestedAppointments = [],
      suggestedEvents = [],
      suggestedTags = [],
      suggestedClusters = [],
    } = req.body || {};

    const finalText = toPlainText({ text, html, content });
    if (!finalText) {
      return res.status(400).json({ error: 'Entry text is required.' });
    }

    const doc = {
      userId: req.user.userId,
      date: typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
        ? date
        : toISODateOnly(new Date()),
      text: finalText,
      mood: mood || undefined,
      cluster: cluster || undefined,
      linkedGoal: linkedGoal || undefined,

      // these all default to [] in the schema, but set explicitly for clarity
      tags: normalizeTags(tags), // ← allows no tags; becomes []
      suggestedTasks: Array.isArray(suggestedTasks) ? suggestedTasks : [],
      suggestedAppointments: Array.isArray(suggestedAppointments) ? suggestedAppointments : [],
      suggestedEvents: Array.isArray(suggestedEvents) ? suggestedEvents : [],
      suggestedTags: Array.isArray(suggestedTags) ? suggestedTags : [],
      suggestedClusters: Array.isArray(suggestedClusters) ? suggestedClusters : [],
    };

    const entry = await Entry.create(doc);

    // return normalized html/content echoes for your frontend renderer
    res.status(201).json({
      ...entry.toObject(),
      html,     // echo back so the client can render immediately
      content,  // legacy
    });
  } catch (err) {
    console.error('POST /entries error:', err);
    res.status(500).json({ error: 'Failed to create entry' });
  }
});

/** DELETE /api/entries/:id */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const del = await Entry.findOneAndDelete({
      _id: id,
      userId: req.user.userId,
    });
    if (!del) return res.status(404).json({ error: 'Entry not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /entries/:id error:', err);
    res.status(500).json({ error: 'Failed to delete entry' });
  }
});

export default router;
