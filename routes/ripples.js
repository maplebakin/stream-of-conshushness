// routes/ripples.js
import express from 'express';
import crypto from 'crypto';
import Ripple from '../models/Ripple.js';
import SuggestedTask from '../models/SuggestedTask.js';

import extractor from '../utils/rippleExtractor.js';
import { sieveRipples, isActiony } from '../utils/rippleSieve.js';
import { logSafeError } from '../utils/errorHandler.js';
import { resolveOwnedEntryId } from '../utils/ownedReferences.js';
import { isValidISODate } from '../utils/recurrence.js';
import { torontoYmd } from '../utils/date.js';

const router = express.Router();

// ——— helpers ———
const ok = (res, payload={}) => res.json({ ok:true, ...payload });
const fail = (res, code, msg) => res.status(code).json({ error: msg });

function toDateKey(dateish){
  if (dateish === undefined || dateish === null || dateish === '') return torontoYmd();
  if (typeof dateish === 'string') return isValidISODate(dateish) ? dateish : '';
  if (dateish instanceof Date && !Number.isNaN(dateish.getTime())) return torontoYmd(dateish);
  return '';
}

function dedupeByKey(items, keyFn){
  const seen=new Set(); const out=[];
  for(const it of items){ const k=keyFn(it); if(seen.has(k)) continue; seen.add(k); out.push(it); }
  return out;
}

function normalizedRippleText(text) {
  return String(text || '').trim().toLowerCase();
}

function directAnalysisKey({ dateKey, entryId, text }) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(['ripple-analyze-v1', dateKey, String(entryId || '~'), normalizedRippleText(text)]))
    .digest('hex');
}

function isDuplicateKeyOnly(error) {
  if (error?.mongoose?.validationErrors && Object.keys(error.mongoose.validationErrors).length) {
    return false;
  }
  if (typeof error?.result?.getWriteConcernError === 'function' && error.result.getWriteConcernError()) {
    return false;
  }
  const writeErrors = error?.writeErrors
    || (typeof error?.result?.getWriteErrors === 'function' ? error.result.getWriteErrors() : []);
  if (Array.isArray(writeErrors) && writeErrors.length) {
    return writeErrors.every((writeError) => Number(writeError?.code) === 11000);
  }
  return Number(error?.code) === 11000;
}

function insertedCountFrom(error) {
  if (Array.isArray(error?.insertedDocs)) return error.insertedDocs.length;
  if (Number.isInteger(error?.result?.insertedCount)) return error.result.insertedCount;
  if (Number.isInteger(error?.result?.result?.nInserted)) return error.result.result.nInserted;
  return 0;
}

// ——— list by day ———
// GET /api/ripples?date=YYYY-MM-DD[&status=pending|approved|dismissed][&cluster=key]
router.get(['/ripples', '/ripples/for-day', '/ripples/pending'], async (req,res)=>{
  try{
    const userId = req.user?.userId || req.user?.id;
    if(!userId) return fail(res, 401, 'not authorized');

    const dateKey = toDateKey(req.query.date);
    if (!dateKey) return fail(res, 400, 'date must be YYYY-MM-DD');
    const statusQ = (req.query.status || (req.path.endsWith('/pending') ? 'pending' : undefined));
    const cluster = req.query.cluster ? String(req.query.cluster) : undefined;

    const q = { userId, dateKey };
    if (statusQ && statusQ !== 'all') q.status = statusQ;
    if (cluster) q.section = cluster;
    if (['1', 'true', 'yes'].includes(String(req.query.standalone || '').toLowerCase())) {
      const backedSuggestions = await SuggestedTask.find({
        userId,
        status: { $in: ['pending', 'accepting', 'rejecting'] },
      })
        .select('sourceRippleId')
        .lean();
      const backedRippleIds = (backedSuggestions || []).map((item) => item.sourceRippleId).filter(Boolean);
      if (backedRippleIds.length) q._id = { $nin: backedRippleIds };
    }

    const rows = await Ripple.find(q).sort({ createdAt: -1 }).lean();

    // NOTE: listing does NOT auto-hide non-actiony rows; we show what's saved.
    return res.json(rows);
  }catch(e){
    logSafeError('ripples list failed', e);
    return fail(res, 500, 'ripples list failed');
  }
});

// alias: GET /api/ripples/:date
router.get('/ripples/:date(\\d{4}-\\d{2}-\\d{2})', async (req,res)=>{
  try{
    const userId = req.user?.userId || req.user?.id;
    if(!userId) return fail(res, 401, 'not authorized');
    const { date } = req.params;
    const { cluster, status } = req.query;

    const q = { userId, dateKey: date };
    if (cluster) q.section = String(cluster);
    if (status && status !== 'all') q.status = String(status);

    const rows = await Ripple.find(q).sort({ createdAt: -1 }).lean();
    return res.json(rows);
  }catch(e){
    logSafeError('ripples alias list failed', e);
    return fail(res, 500, 'ripples list failed');
  }
});

// ——— list by entry ———
// GET /api/ripples/by-entry/:entryId   (optional ?date=YYYY-MM-DD)
router.get('/ripples/by-entry/:entryId', async (req,res)=>{
  try{
    const userId = req.user?.userId || req.user?.id;
    if(!userId) return fail(res, 401, 'not authorized');
    const { entryId } = req.params;
    const dateKey = req.query.date ? toDateKey(req.query.date) : undefined;

    const q = { userId, entryId };
    if (dateKey) q.dateKey = dateKey;

    const rows = await Ripple.find(q).sort({ createdAt: -1 }).lean();
    return res.json(rows);
  }catch(e){
    logSafeError('ripples by entry failed', e);
    return fail(res, 500, 'ripples by-entry failed');
  }
});

// ——— approve / dismiss ———
router.post('/ripples/:id/approve', async (req,res)=>{
  try{
    const userId = req.user?.userId || req.user?.id;
    const { id } = req.params;
    const doc = await Ripple.findOneAndUpdate({ _id:id, userId }, { $set:{ status:'approved' } }, { new:true });
    if(!doc) return fail(res, 404, 'not found');
    return ok(res, { ripple: doc });
  }catch(e){
    logSafeError('ripples approve failed', e);
    return fail(res, 500, 'approve failed');
  }
});

router.post('/ripples/:id/dismiss', async (req,res)=>{
  try{
    const userId = req.user?.userId || req.user?.id;
    const { id } = req.params;
    const doc = await Ripple.findOneAndUpdate({ _id:id, userId }, { $set:{ status:'dismissed' } }, { new:true });
    if(!doc) return fail(res, 404, 'not found');
    return ok(res, { ripple: doc });
  }catch(e){
    logSafeError('ripples dismiss failed', e);
    return fail(res, 500, 'dismiss failed');
  }
});

// ——— analyze & create (STRICT) ———
// POST /api/ripples/analyze  { text, date?, entryId?, section? }
router.post('/ripples/analyze', async (req,res)=>{
  try{
    const userId = req.user?.userId || req.user?.id;
    if(!userId) return fail(res, 401, 'not authorized');

    let body = req.body || {};
    if (body && typeof body.entryId === 'object' && body.entryId !== null && !Array.isArray(body.entryId)) {
      // tolerate { entryId:{ text, date } }
      body = { ...body, ...body.entryId };
      delete body.entryId;
    }

    const rawText = body.text ?? body.content;
    const text = typeof rawText === 'string' ? rawText : '';
    if (!text.trim()) return fail(res, 400, 'text required');

    const dateKey = toDateKey(body.date);
    if (!dateKey) return fail(res, 400, 'date must be YYYY-MM-DD');
    const requestedEntryId = typeof body.entryId === 'string' ? body.entryId : undefined;
    const entryId = requestedEntryId ? await resolveOwnedEntryId(userId, requestedEntryId) : undefined;
    if (requestedEntryId && !entryId) return fail(res, 400, 'entryId must reference one of your entries');
    const section = body.section ? String(body.section) : undefined;

    // 1) Extract stingy ripples
    const { ripples: extracted } = extractor.extractRipplesFromEntry({
      text,
      entryDate: dateKey,
      originalContext: text
    });

    // 2) Server-side sieve to kill chatter completely
    let ripples = sieveRipples(
      extracted.map(r => ({
        type: r.type || 'suggestedTask',
        text: r.extractedText || r.text || '',
        entryDate: dateKey,
        originalContext: r.originalContext || text,
        meta: r.meta || {},
        confidence: r.confidence ?? null
      }))
    );
    ripples = dedupeByKey(ripples, (r) => normalizedRippleText(r.text));

    if (!ripples.length) {
      return res.status(200).json({ ok: true, created: 0, skipped: 0, ripples: [] });
    }

    // 3) Skip dupes already saved for that date (same text, same entryId if given)
    const texts = ripples.map(r => r.text);
    const existing = await Ripple.find({
      userId,
      dateKey,
      text: { $in: texts },
      ...(entryId ? { entryId } : {})
    }).lean();

    const existKey = new Set(existing.map(r => `${(r.entryId||'~')}|${normalizedRippleText(r.text)}`));

    const toInsert = ripples
      .filter(r => !existKey.has(`${(entryId||'~')}|${normalizedRippleText(r.text)}`))
      .map((r) => ({
        userId,
        entryId,
        analysisKey: directAnalysisKey({ dateKey, entryId, text: r.text }),
        dateKey,
        section,
        text: r.text,
        type: r.type,
        status: 'pending',
        score: Math.round((r.confidence ?? 0.6) * 100),
        source: 'analyze',
        meta: r.meta || {}
      }));

    let createdCount = 0;
    if (toInsert.length) {
      try {
        const created = await Ripple.insertMany(toInsert, { ordered:false });
        createdCount = created.length;
      } catch (error) {
        // The unique analysis receipt is the concurrency boundary. A retry that
        // loses the insert race is successful and returns the winning records.
        if (!isDuplicateKeyOnly(error)) throw error;
        createdCount = insertedCountFrom(error);
      }
    }

    // Return what's now present (existing + created), sorted oldest->newest
    const allRows = await Ripple.find({
      userId,
      dateKey,
      ...(entryId ? { entryId } : {})
    }).sort({ createdAt: 1 }).lean();

    return res.status(createdCount ? 201 : 200).json({
      ok: true,
      created: createdCount,
      skipped: ripples.length - createdCount,
      ripples: allRows
    });
  }catch(e){
    logSafeError('ripples analyze failed', e);
    return fail(res, 500, 'analyze failed');
  }
});

// ——— prune junk already saved for a day ———
// POST /api/ripples/prune  { date: 'YYYY-MM-DD' }
router.post('/ripples/prune', async (req,res)=>{
  try{
    const userId = req.user?.userId || req.user?.id;
    if(!userId) return fail(res, 401, 'not authorized');
    const dateKey = toDateKey(req.body?.date || req.query?.date);
    if(!dateKey) return fail(res, 400, 'invalid date');

    // Pruning is a user-invoked review decision, not a destructive cleanup.
    // Only pending rows are eligible, and represented ripples remain linked to
    // their suggestions. Soft dismissal preserves provenance and makes a retry
    // safe even if another process creates a reference concurrently.
    const all = await Ripple.find({ userId, dateKey, status: 'pending' }).lean();
    const bad = all.filter(r => !isActiony(r.text || r.extractedText));
    let protectedIds = new Set();
    if (bad.length) {
      const represented = await SuggestedTask.find({
        userId,
        sourceRippleId: { $in: bad.map((r) => r._id) },
      }).select('sourceRippleId').lean();
      protectedIds = new Set((represented || []).map((item) => String(item.sourceRippleId)));
    }
    const prunableIds = bad
      .filter((r) => !protectedIds.has(String(r._id)))
      .map((r) => r._id);
    let pruned = 0;
    if (prunableIds.length) {
      const result = await Ripple.updateMany(
        { userId, dateKey, status: 'pending', _id: { $in: prunableIds } },
        { $set: { status: 'dismissed' } }
      );
      pruned = result.modifiedCount ?? result.nModified ?? 0;
    }
    return ok(res, {
      date: dateKey,
      pruned,
      kept: all.length - pruned,
      protected: protectedIds.size,
    });
  }catch(e){
    logSafeError('ripples prune failed', e);
    return fail(res, 500, 'prune failed');
  }
});

export default router;
