// routes/ripples.js
import express from 'express';
import Ripple from '../models/Ripple.js';

import extractor from '../utils/rippleExtractor.js';
import { sieveRipples, isActiony } from '../utils/rippleSieve.js';

const router = express.Router();

// ——— helpers ———
const ok = (res, payload={}) => res.json({ ok:true, ...payload });
const fail = (res, code, msg) => res.status(code).json({ error: msg });

function toDateKey(dateish){
  if (typeof dateish === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateish)) return dateish;
  const d = dateish instanceof Date ? dateish : new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}

function dedupeByKey(items, keyFn){
  const seen=new Set(); const out=[];
  for(const it of items){ const k=keyFn(it); if(seen.has(k)) continue; seen.add(k); out.push(it); }
  return out;
}

// ——— list by day ———
// GET /api/ripples?date=YYYY-MM-DD[&status=pending|approved|dismissed][&cluster=key]
router.get(['/ripples', '/ripples/for-day', '/ripples/pending'], async (req,res)=>{
  try{
    const userId = req.user?.userId || req.user?.id;
    if(!userId) return fail(res, 401, 'not authorized');

    const dateKey = toDateKey(req.query.date);
    const statusQ = (req.query.status || (req.path.endsWith('/pending') ? 'pending' : undefined));
    const cluster = req.query.cluster ? String(req.query.cluster) : undefined;

    const q = { userId, dateKey };
    if (statusQ && statusQ !== 'all') q.status = statusQ;
    if (cluster) q.section = cluster;

    const rows = await Ripple.find(q).sort({ createdAt: -1 }).lean();

    // NOTE: listing does NOT auto-hide non-actiony rows; we show what's saved.
    return res.json(rows);
  }catch(e){
    console.error('[ripples] list error:', e);
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
    console.error('[ripples] alias list error:', e);
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
    console.error('[ripples] by-entry error:', e);
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
    console.error('[ripples] approve error:', e);
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
    console.error('[ripples] dismiss error:', e);
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
    const entryId = typeof body.entryId === 'string' ? body.entryId : undefined;
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

    const existKey = new Set(existing.map(r => `${(r.entryId||'~')}|${r.text.toLowerCase()}`));

    const toInsert = ripples
      .filter(r => !existKey.has(`${(entryId||'~')}|${r.text.toLowerCase()}`))
      .map((r, idx) => ({
        userId,
        entryId,
        dateKey,
        section,
        text: r.text,
        type: r.type,
        status: 'pending',
        score: Math.round((r.confidence ?? 0.6) * 100),
        source: 'analyze',
        meta: r.meta || {}
      }));

    const created = toInsert.length ? await Ripple.insertMany(toInsert, { ordered:false }) : [];

    // Return what's now present (existing + created), sorted oldest->newest
    const allRows = await Ripple.find({
      userId,
      dateKey,
      ...(entryId ? { entryId } : {})
    }).sort({ createdAt: 1 }).lean();

    return res.status(created.length ? 201 : 200).json({
      ok: true,
      created: created.length,
      skipped: existing.length,
      ripples: allRows
    });
  }catch(e){
    console.error('[ripples] analyze error:', e);
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

    const all = await Ripple.find({ userId, dateKey }).lean();
    const bad = all.filter(r => !isActiony(r.text || r.extractedText));
    if (bad.length) {
      await Ripple.deleteMany({ _id: { $in: bad.map(r => r._id) } });
    }
    return ok(res, { date: dateKey, pruned: bad.length, kept: all.length - bad.length });
  }catch(e){
    console.error('[ripples] prune error:', e);
    return fail(res, 500, 'prune failed');
  }
});

export default router;
