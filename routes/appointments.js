// server/routes/appointments.js
import express from 'express';
import Appointment from '../models/Appointment.js';
import auth from '../middleware/auth.js';
import { expandDatesInRange } from '../utils/recurrence.js';

const router = express.Router();
router.use(auth);

// --- Helpers ---
function clamp(n, lo, hi) {
  const x = parseInt(n, 10);
  if (Number.isNaN(x)) return lo;
  return Math.max(lo, Math.min(hi, x));
}
function isISO(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')); }
function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k];
  return out;
}

// ---------- CREATE (one-off or series) ----------
/**
 * POST /api/appointments
 * Body (one-off):
 *   { title, date, timeStart?, timeEnd?, location?, details?, cluster? }
 * Body (series):
 *   { title, startDate, rrule, timeStart?, timeEnd?, location?, details?, cluster?, until? }
 */
router.post('/', async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id || req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Access denied' });

    const b = req.body || {};
    const base = {
      userId,
      title   : String(b.title || '').trim(),
      date    : b.date || null,
      startDate: b.startDate || null,
      rrule   : b.rrule || '',
      until   : b.until || null,
      time    : b.time || null,
      timeStart: b.timeStart || b.time || null,
      timeEnd : b.timeEnd || null,
      location: b.location || '',
      details : b.details || '',
      cluster : b.cluster || '',
      tz      : b.tz || 'America/Toronto',
    };

    if (!base.title) return res.status(400).json({ error: 'title is required' });
    if (base.rrule) {
      if (!isISO(base.startDate)) return res.status(400).json({ error: 'startDate (YYYY-MM-DD) is required with rrule' });
    } else {
      if (!isISO(base.date)) return res.status(400).json({ error: 'date (YYYY-MM-DD) is required' });
    }

    const doc = await Appointment.create(base);
    res.status(201).json(doc);
  } catch (err) {
    console.error('[appointments] create failed:', err);
    res.status(500).json({ error: err?.message || 'Failed to create appointment' });
  }
});

// ---------- LIST (range, with expansion) ----------
/**
 * GET /api/appointments?from=YYYY-MM-DD&to=YYYY-MM-DD&includeSeries=1
 * - Returns one-off instances between [from,to]
 * - If includeSeries, expands series into virtual instances in [from,to]
 * Dedupe: if a virtual instance collides (same title/date/timeStart) with a persisted one,
 *         the persisted one wins.
 */
router.get('/', async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id || req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Access denied' });

    const from = isISO(req.query.from) ? req.query.from : null;
    const to   = isISO(req.query.to) ? req.query.to : null;
    if (!from && !to) {
      // default: show next 30 days
      const now = new Date();
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      const end = new Date(start.getTime()); end.setUTCDate(end.getUTCDate() + 30);
      const y = (d) => d.getUTCFullYear();
      const m = (d) => String(d.getUTCMonth() + 1).padStart(2, '0');
      const d2= (d) => String(d.getUTCDate()).padStart(2, '0');
      req.query.from = `${y(start)}-${m(start)}-${d2(start)}`;
      req.query.to   = `${y(end)}-${m(end)}-${d2(end)}`;
    }

    const F = req.query.from;
    const T = req.query.to;

    // 1) load one-offs in range
    const rangeQ = { userId };
    if (F && T) rangeQ.date = { $gte: F, $lte: T };
    else if (F) rangeQ.date = { $gte: F };
    else if (T) rangeQ.date = { $lte: T };
    rangeQ.rrule = ''; // ensure not series

    const oneOffs = await Appointment.find(rangeQ)
      .sort({ date: 1, timeStart: 1, time: 1, createdAt: 1 })
      .lean();

    // 2) expand series if requested
    let virtuals = [];
    if (String(req.query.includeSeries || '1') !== '0') {
      const seriesQ = { userId, rrule: { $ne: '' } };
      // Narrow by series bounds: startDate ≤ T and (until null or until ≥ F)
      if (T) seriesQ.startDate = { $lte: T };
      if (F) seriesQ.$or = [{ until: null }, { until: { $gte: F } }, { until: '' }];

      const series = await Appointment.find(seriesQ).lean();

      for (const s of series) {
        const dates = expandDatesInRange(s.rrule, s.startDate, F, T);
        for (const dISO of dates) {
          virtuals.push({
            _id: `virtual:${s._id}:${dISO}`,
            userId,
            title: s.title,
            date : dISO,
            rrule: s.rrule,
            startDate: s.startDate,
            until: s.until,
            tz: s.tz || 'America/Toronto',
            timeStart: s.timeStart || null,
            timeEnd  : s.timeEnd || null,
            location : s.location || '',
            details  : s.details || '',
            cluster  : s.cluster || '',
            entryId  : s.entryId || null,
            isRecurring: true,
            seriesId: s._id,
          });
        }
      }
    }

    // 3) de-dupe virtuals against persisted one-offs by (date,timeStart,title)
    const seen = new Set(oneOffs.map(a => `${a.date}|${a.timeStart || ''}|${a.title}`));
    virtuals = virtuals.filter(v => !seen.has(`${v.date}|${v.timeStart || ''}|${v.title}`));

    const combined = [...oneOffs, ...virtuals]
      .sort((a, b) => {
        const ka = `${a.date}T${a.timeStart || a.time || '99:99'}`;
        const kb = `${b.date}T${b.timeStart || b.time || '99:99'}`;
        return ka.localeCompare(kb);
      });

    // Optional pagination (cheap)
    const limit = clamp(req.query.limit ?? 1000, 1, 5000);
    res.json(combined.slice(0, limit));
  } catch (err) {
    console.error('[appointments] list failed:', err);
    res.status(500).json({ error: err?.message || 'Failed to load appointments' });
  }
});

export default router;
