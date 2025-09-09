// routes/ripples.js
import express from 'express';
import Ripple from '../models/Ripple.js';
import auth from '../middleware/auth.js';

const router = express.Router();
router.use(auth);

const ok   = (res, payload = {}) => res.json({ ok: true, ...payload });
const fail = (res, code, msg) => res.status(code).json({ error: msg });

/* ------------------------ helpers ------------------------ */
function toDateKey(dateish) {
  if (typeof dateish === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateish)) return dateish;
  const d = dateish instanceof Date ? dateish : new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ultra-light heuristic extractor — momentum over poetry
function extractRipples(text = '') {
  const chunks = text
    .split(/[\n\r]+|(?<=[.!?])\s+/g)
    .map(s => s.trim())
    .filter(Boolean);

  const verbs = /(buy|call|schedule|email|pay|clean|fix|book|remember|start|finish|send|write|plan|check|update|backup|organize|cook|wash|laundry|groceries|walk|water)/i;

  const picks = [];
  for (const c of chunks) {
    if (verbs.test(c) || c.length <= 60 || /^[-*•]\s/.test(c)) {
      picks.push(c.replace(/^[-*•]\s*/, '').trim());
    }
    if (picks.length >= 8) break; // keep it tidy
  }
  if (picks.length === 0 && text.trim()) picks.push(text.trim().slice(0, 120));
  return picks;
}

/* ------------------------ list (daily) ------------------------ */
// GET /api/ripples?date=YYYY-MM-DD[&status=pending|approved|dismissed][&cluster=key]
// Also accept legacy paths:
/**   /api/ripples/for-day?date=...   */
/**   /api/ripples/pending?date=...   */
router.get(['/ripples', '/ripples/pending', '/ripples/for-day'], async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id;
    if (!userId) return fail(res, 401, 'not authorized');

    const dateKey = toDateKey(req.query.date);
    const statusQ = (req.query.status || (req.path.endsWith('/pending') ? 'pending' : undefined));
    const cluster = req.query.cluster ? String(req.query.cluster) : undefined;

    const q = { userId, dateKey };
    if (statusQ && statusQ !== 'all') q.status = statusQ;
    if (cluster) q.section = cluster;

    const ripples = await Ripple.find(q).sort({ createdAt: -1 }).lean();
    return res.json(ripples); // plain array
  } catch (e) {
    console.error('[ripples] list error:', e);
    return fail(res, 500, 'ripples list failed');
  }
});

/* ------------------------ path alias ------------------------ */
// GET /api/ripples/:date  → same as query form (scan, cluster, status are optional)
router.get('/ripples/:date(\\d{4}-\\d{2}-\\d{2})', async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id;
    if (!userId) return fail(res, 401, 'not authorized');
    const { date } = req.params;
    const { cluster, status } = req.query;
    const q = { userId, dateKey: date };
    if (cluster) q.section = String(cluster);
    if (status && status !== 'all') q.status = String(status);
    const rows = await Ripple.find(q).sort({ createdAt: -1 }).lean();
    res.json(rows);
  } catch (e) {
    console.error('alias /api/ripples/:date failed', e);
    res.status(500).json({ error: 'ripples alias failed' });
  }
});

/* ------------------------ approve/dismiss ------------------------ */
router.post('/ripples/:id/approve', async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id;
    const { id } = req.params;
    const doc = await Ripple.findOneAndUpdate(
      { _id: id, userId },
      { $set: { status: 'approved' } },
      { new: true }
    );
    if (!doc) return fail(res, 404, 'not found');
    return ok(res, { ripple: doc });
  } catch (e) {
    console.error('[ripples] approve error:', e);
    return fail(res, 500, 'approve failed');
  }
});

router.post('/ripples/:id/dismiss', async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id;
    const { id } = req.params;
    const doc = await Ripple.findOneAndUpdate(
      { _id: id, userId },
      { $set: { status: 'dismissed' } },
      { new: true }
    );
    if (!doc) return fail(res, 404, 'not found');
    return ok(res, { ripple: doc });
  } catch (e) {
    console.error('[ripples] dismiss error:', e);
    return fail(res, 500, 'dismiss failed');
  }
});

// generic patch (status, section, score, text)
router.patch('/ripples/:id', async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id;
    const { id } = req.params;
    const allowed = ['status', 'section', 'score', 'text'];
    const update = {};
    for (const k of allowed) if (k in req.body) update[k] = req.body[k];
    const doc = await Ripple.findOneAndUpdate(
      { _id: id, userId },
      { $set: update },
      { new: true }
    );
    if (!doc) return fail(res, 404, 'not found');
    return ok(res, { ripple: doc });
  } catch (e) {
    console.error('[ripples] patch error:', e);
    return fail(res, 500, 'update failed');
  }
});

/* ------------------------ analyze → create pending ripples ------------------------ */
// POST /api/ripples/analyze  (idempotent per day+text)
router.post('/ripples/analyze', async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id;
    if (!userId) return fail(res, 401, 'not authorized');

    let body = req.body || {};
    if (body && typeof body.entryId === 'object' && body.entryId !== null && !Array.isArray(body.entryId)) {
      body = { ...body, ...body.entryId }; // tolerate { entryId:{ text, date } }
      delete body.entryId;
    }

    const rawText = body.text ?? body.content;
    const text = typeof rawText === 'string' ? rawText : '';
    if (!text.trim()) return fail(res, 400, 'text required');

    const dateKey = toDateKey(body.date);

    // 1) extract + normalize lines
    const lines = extractRipples(text);
    const norm = s => s.toLowerCase().replace(/\s+/g, ' ').trim();
    const uniqLines = Array.from(new Map(lines.map(s => [norm(s), s])).values()); // de-dupe within request

    // 2) find already-existing for same day+text
    const existing = await Ripple.find({
      userId,
      dateKey,
      text: { $in: uniqLines }
    }).lean();

    const existingSet = new Set(existing.map(r => norm(r.text)));

    // 3) only insert truly new ones
    const toInsert = uniqLines
      .filter(s => !existingSet.has(norm(s)))
      .map((line, idx) => ({
        userId,
        entryId: typeof body.entryId === 'string' ? body.entryId : undefined,
        dateKey,
        text: line,
        score: Math.max(0, 100 - idx * 5),
        status: 'pending',
        source: 'analyze',
      }));

    const created = toInsert.length
      ? await Ripple.insertMany(toInsert, { ordered: false })
      : [];

    // 4) return both (so the caller can show what exists)
    const ripples = [...existing, ...created].sort((a, b) =>
      new Date(a.createdAt || 0) - new Date(b.createdAt || 0)
    );

    return res.status(created.length ? 201 : 200).json({
      ok: true,
      created: created.length,
      skipped: existing.length,
      ripples,
    });
  } catch (e) {
    console.error('[ripples] analyze error:', e);
    return fail(res, 500, 'analyze failed');
  }
});

export default router;
