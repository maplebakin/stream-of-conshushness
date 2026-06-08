// server/routes/appointments.js
import express from 'express';
import mongoose from 'mongoose';
import Appointment from '../models/Appointment.js';
import auth from '../middleware/auth.js';
import { expandDatesInRange } from '../utils/recurrence.js';
import { normalizeClusterIds, resolveClusterIdForOwner } from '../utils/clusterIds.js';

const router = express.Router();
router.use(auth);
const { ObjectId } = mongoose.Types;

// --- Helpers ---
function clamp(n, lo, hi) {
  const x = parseInt(n, 10);
  if (Number.isNaN(x)) return lo;
  return Math.max(lo, Math.min(hi, x));
}
function isISO(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')); }
function getUserId(req) {
  return req.user?.id || req.user?._id || req.user?.userId;
}
function isValidId(id) {
  return ObjectId.isValid(id);
}
function normalizeNullableString(value) {
  return value === '' || value === undefined ? null : value;
}
function normalizeEntryId(value) {
  if (!value) return null;
  return ObjectId.isValid(value) ? value : null;
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
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Access denied' });

    const b = req.body || {};
    let clusterIds = normalizeClusterIds(b.clusters);
    if (!clusterIds.length && b.clusterId) {
      const resolved = await resolveClusterIdForOwner(userId, b.clusterId);
      if (resolved) clusterIds = [resolved];
    } else if (!clusterIds.length && b.cluster) {
      const resolved = await resolveClusterIdForOwner(userId, b.cluster);
      if (resolved) clusterIds = [resolved];
    }

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
      clusters: clusterIds,
      tz      : b.tz || 'America/Toronto',
      entryId : normalizeEntryId(b.entryId),
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

    const clusterFilters = [];
    if (req.query.cluster) {
      clusterFilters.push({ cluster: String(req.query.cluster) });
    }

    let resolvedClusterId = null;
    if (req.query.clusterId) {
      resolvedClusterId = await resolveClusterIdForOwner(userId, req.query.clusterId);
      if (!resolvedClusterId) return res.json([]);
      clusterFilters.push({ clusters: resolvedClusterId });
    }

    const applyClusterFilters = (base = {}) => {
      if (!clusterFilters.length) return base;
      if (clusterFilters.length === 1) return { ...base, ...clusterFilters[0] };
      return { ...base, $or: clusterFilters };
    };

    const rawFrom = req.query.from;
    const rawTo   = req.query.to;
    const from = isISO(rawFrom) ? rawFrom : null;
    const to   = isISO(rawTo) ? rawTo : null;

    if ((rawFrom !== undefined || rawTo !== undefined) && !from && !to) {
      return res.status(400).json({ error: 'Invalid date range' });
    }

    let fromISO = from;
    let toISO   = to;

    if (!fromISO && !toISO) {
      // default: show next 30 days
      const now = new Date();
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      const end = new Date(start.getTime()); end.setUTCDate(end.getUTCDate() + 30);
      const y = (d) => d.getUTCFullYear();
      const m = (d) => String(d.getUTCMonth() + 1).padStart(2, '0');
      const d2= (d) => String(d.getUTCDate()).padStart(2, '0');
      fromISO = `${y(start)}-${m(start)}-${d2(start)}`;
      toISO   = `${y(end)}-${m(end)}-${d2(end)}`;
    }

    const rangeFrom = fromISO;
    const rangeTo   = toISO;
    const expandFrom = fromISO || toISO;
    const expandTo   = toISO || fromISO;

    // 1) load one-offs in range
    const rangeQ = applyClusterFilters({ userId });
    if (rangeFrom && rangeTo) rangeQ.date = { $gte: rangeFrom, $lte: rangeTo };
    else if (rangeFrom) rangeQ.date = { $gte: rangeFrom };
    else if (rangeTo) rangeQ.date = { $lte: rangeTo };
    rangeQ.rrule = ''; // ensure not series

    const oneOffs = await Appointment.find(rangeQ)
      .sort({ date: 1, timeStart: 1, time: 1, createdAt: 1 })
      .lean();

    // 2) expand series if requested
    let virtuals = [];
    if (String(req.query.includeSeries || '1') !== '0') {
      const seriesQ = applyClusterFilters({ userId, rrule: { $ne: '' } });
      // Narrow by series bounds: startDate ≤ expandTo and (until null or until ≥ expandFrom)
      if (expandTo) seriesQ.startDate = { $lte: expandTo };
      if (expandFrom) seriesQ.$or = [{ until: null }, { until: { $gte: expandFrom } }, { until: '' }];

      const series = await Appointment.find(seriesQ).lean();

      for (const s of series) {
        const boundedExpandTo = s.until && s.until < expandTo ? s.until : expandTo;
        const dates = expandDatesInRange(s.rrule, s.startDate, expandFrom, boundedExpandTo);
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
            clusters : Array.isArray(s.clusters) ? s.clusters : [],
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

// ---------- UPDATE ----------
router.patch('/:id', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Access denied' });
    if (!isValidId(req.params.id)) return res.status(400).json({ error: 'Invalid appointment id' });

    const doc = await Appointment.findOne({ _id: req.params.id, userId });
    if (!doc) return res.status(404).json({ error: 'Appointment not found' });

    const b = req.body || {};
    if ('title' in b) {
      const title = String(b.title || '').trim();
      if (!title) return res.status(400).json({ error: 'title is required' });
      doc.title = title;
    }
    if ('date' in b) doc.date = normalizeNullableString(b.date);
    if ('startDate' in b) doc.startDate = normalizeNullableString(b.startDate);
    if ('rrule' in b) doc.rrule = b.rrule || '';
    if ('until' in b) doc.until = normalizeNullableString(b.until);
    if ('time' in b) doc.time = normalizeNullableString(b.time);
    if ('timeStart' in b) doc.timeStart = normalizeNullableString(b.timeStart);
    if ('timeEnd' in b) doc.timeEnd = normalizeNullableString(b.timeEnd);
    if ('location' in b) doc.location = b.location || '';
    if ('details' in b) doc.details = b.details || '';
    if ('cluster' in b) doc.cluster = b.cluster || '';
    if ('tz' in b) doc.tz = b.tz || 'America/Toronto';
    if ('entryId' in b) doc.entryId = b.entryId || null;

    if ('clusters' in b || 'clusterId' in b || 'cluster' in b) {
      let clusterIds = normalizeClusterIds(b.clusters);
      if (!clusterIds.length && b.clusterId) {
        const resolved = await resolveClusterIdForOwner(userId, b.clusterId);
        if (resolved) clusterIds = [resolved];
      } else if (!clusterIds.length && b.cluster) {
        const resolved = await resolveClusterIdForOwner(userId, b.cluster);
        if (resolved) clusterIds = [resolved];
      }
      doc.clusters = clusterIds;
    }

    if (doc.rrule) {
      if (!isISO(doc.startDate)) return res.status(400).json({ error: 'startDate (YYYY-MM-DD) is required with rrule' });
      doc.date = doc.date || null;
    } else if (!isISO(doc.date)) {
      return res.status(400).json({ error: 'date (YYYY-MM-DD) is required' });
    }

    await doc.save();
    res.json(doc);
  } catch (err) {
    console.error('[appointments] update failed:', err);
    const code = err?.name === 'ValidationError' ? 400 : 500;
    res.status(code).json({ error: err?.message || 'Failed to update appointment' });
  }
});

// ---------- DELETE ----------
router.delete('/:id', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Access denied' });
    if (!isValidId(req.params.id)) return res.status(400).json({ error: 'Invalid appointment id' });

    const deleted = await Appointment.findOneAndDelete({ _id: req.params.id, userId });
    if (!deleted) return res.status(404).json({ error: 'Appointment not found' });
    res.json({ ok: true, deleted: deleted._id });
  } catch (err) {
    console.error('[appointments] delete failed:', err);
    res.status(500).json({ error: err?.message || 'Failed to delete appointment' });
  }
});

export default router;
