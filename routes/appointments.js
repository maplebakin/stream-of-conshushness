// server/routes/appointments.js
import express from 'express';
import mongoose from 'mongoose';
import Appointment from '../models/Appointment.js';
import auth from '../middleware/auth.js';
import { expandDatesInRange, isValidISODate, parseRRule } from '../utils/recurrence.js';
import { resolveClusterIdForOwner, resolveClusterIdsForOwner } from '../utils/clusterIds.js';
import { logSafeError } from '../utils/errorHandler.js';
import { resolveOwnedEntryId } from '../utils/ownedReferences.js';

const router = express.Router();
router.use(auth);
const { ObjectId } = mongoose.Types;

// --- Helpers ---
function clamp(n, lo, hi) {
  const x = parseInt(n, 10);
  if (Number.isNaN(x)) return lo;
  return Math.max(lo, Math.min(hi, x));
}
function isISO(s) { return isValidISODate(s); }
function getUserId(req) {
  return req.user?.id || req.user?._id || req.user?.userId;
}
function isValidId(id) {
  return ObjectId.isValid(id);
}
function normalizeNullableString(value) {
  return value === '' || value === undefined ? null : value;
}

function normalizeTime(value) {
  if (value == null || value === '') return null;
  const match = String(value).trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function isSupportedRRule(value) {
  if (!value) return true;
  const rule = parseRRule(value);
  if (!['DAILY', 'WEEKLY', 'MONTHLY'].includes(rule.FREQ)) return false;
  if (rule.INTERVAL && (!/^\d+$/.test(rule.INTERVAL) || Number(rule.INTERVAL) < 1)) return false;
  if (rule.COUNT && (!/^\d+$/.test(rule.COUNT) || Number(rule.COUNT) < 1)) return false;
  if (rule.UNTIL && !isISO(rule.UNTIL)) return false;
  if (rule.BYDAY) {
    const days = rule.BYDAY.split(',');
    if (rule.FREQ !== 'WEEKLY' || days.some((day) => !/^(SU|MO|TU|WE|TH|FR|SA)$/.test(day))) return false;
  }
  return true;
}

function isValidTimeZone(value) {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

function validateAppointmentShape(value) {
  if (value.rrule) {
    if (!isISO(value.startDate)) return 'startDate (YYYY-MM-DD) is required with rrule';
    if (!isSupportedRRule(value.rrule)) return 'rrule is invalid or unsupported';
    if (value.until && (!isISO(value.until) || value.until < value.startDate)) {
      return 'until must be a valid date on or after startDate';
    }
  } else if (!isISO(value.date)) {
    return 'date (YYYY-MM-DD) is required';
  }
  if (value.timeStart && !normalizeTime(value.timeStart)) return 'timeStart must be a valid HH:MM time';
  if (value.timeEnd && !normalizeTime(value.timeEnd)) return 'timeEnd must be a valid HH:MM time';
  if (value.time && !normalizeTime(value.time)) return 'time must be a valid HH:MM time';
  const start = normalizeTime(value.timeStart || value.time);
  const end = normalizeTime(value.timeEnd);
  if (start && end && end < start) return 'timeEnd must not be earlier than timeStart';
  if (!isValidTimeZone(value.tz || 'America/Toronto')) return 'tz must be a valid IANA time zone';
  return '';
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
    let clusterIds = await resolveClusterIdsForOwner(userId, b.clusters);
    if (!clusterIds.length && b.clusterId) {
      const resolved = await resolveClusterIdForOwner(userId, b.clusterId);
      if (resolved) clusterIds = [resolved];
    } else if (!clusterIds.length && b.cluster) {
      const resolved = await resolveClusterIdForOwner(userId, b.cluster);
      if (resolved) clusterIds = [resolved];
    }
    const entryId = b.entryId ? await resolveOwnedEntryId(userId, b.entryId) : null;
    if (b.entryId && !entryId) return res.status(400).json({ error: 'entryId must reference one of your entries' });

    const base = {
      userId,
      title   : String(b.title || '').trim(),
      date    : b.date || null,
      startDate: b.startDate || null,
      rrule   : b.rrule || '',
      until   : b.until || null,
      time    : normalizeTime(b.time),
      timeStart: normalizeTime(b.timeStart || b.time),
      timeEnd : normalizeTime(b.timeEnd),
      location: b.location || '',
      details : b.details || '',
      cluster : b.cluster || '',
      clusters: clusterIds,
      tz      : b.tz || 'America/Toronto',
      entryId,
    };

    if (!base.title) return res.status(400).json({ error: 'title is required' });
    const validationError = validateAppointmentShape({
      ...base,
      // Preserve raw values so malformed times cannot silently become null.
      time: b.time || null,
      timeStart: b.timeStart || b.time || null,
      timeEnd: b.timeEnd || null,
    });
    if (validationError) return res.status(400).json({ error: validationError });

    const doc = await Appointment.create(base);
    res.status(201).json(doc);
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ error: 'An appointment with this title, date, and time already exists' });
    }
    logSafeError('appointments create failed', err);
    res.status(500).json({ error: 'Failed to create appointment' });
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
    const requestedCluster = req.query.clusterId || req.query.cluster;
    if (requestedCluster) {
      const resolvedClusterId = await resolveClusterIdForOwner(userId, requestedCluster);
      if (resolvedClusterId) clusterFilters.push({ clusters: resolvedClusterId });
      // Preserve reads for legacy records that only stored the slug.
      if (req.query.cluster) clusterFilters.push({ cluster: String(req.query.cluster) });
      if (!clusterFilters.length) return res.json([]);
    }

    const applyClusterFilters = (base = {}) => {
      if (!clusterFilters.length) return base;
      if (clusterFilters.length === 1) return { ...base, ...clusterFilters[0] };
      return { ...base, $and: [...(base.$and || []), { $or: clusterFilters }] };
    };

    const rawFrom = req.query.from;
    const rawTo   = req.query.to;
    const from = rawFrom === undefined ? null : (isISO(rawFrom) ? rawFrom : null);
    const to   = rawTo === undefined ? null : (isISO(rawTo) ? rawTo : null);

    if ((rawFrom !== undefined && !from) || (rawTo !== undefined && !to) || (from && to && from > to)) {
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
    const rangeQ = applyClusterFilters({
      userId,
      automationReviewStatus: { $nin: ['pending', 'dismissed'] },
      scheduleStatus: { $ne: 'cancelled' },
    });
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
      const seriesQ = applyClusterFilters({
        userId,
        rrule: { $ne: '' },
        automationReviewStatus: { $nin: ['pending', 'dismissed'] },
        scheduleStatus: { $ne: 'cancelled' },
      });
      // Narrow by series bounds: startDate ≤ expandTo and (until null or until ≥ expandFrom)
      if (expandTo) seriesQ.startDate = { $lte: expandTo };
      if (expandFrom) {
        const untilBounds = [{ until: null }, { until: { $gte: expandFrom } }, { until: '' }];
        if (seriesQ.$and) seriesQ.$and.push({ $or: untilBounds });
        else seriesQ.$or = untilBounds;
      }

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
    logSafeError('appointments list failed', err);
    res.status(500).json({ error: 'Failed to load appointments' });
  }
});

// ---------- AUTOMATION REVIEW DECISION ----------
router.patch('/:id/review', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Access denied' });
    if (!isValidId(req.params.id)) return res.status(400).json({ error: 'Invalid appointment id' });
    const action = String(req.body?.action || '').trim();
    if (!['keep', 'dismiss'].includes(action)) {
      return res.status(400).json({ error: 'action must be keep or dismiss' });
    }

    const doc = await Appointment.findOne({
      _id: req.params.id,
      userId,
      source: 'entry-automation',
    });
    if (!doc) return res.status(404).json({ error: 'Appointment not found' });
    doc.automationReviewStatus = action === 'keep' ? 'kept' : 'dismissed';
    await doc.save();
    return res.json(doc);
  } catch (err) {
    logSafeError('appointment review decision failed', err);
    return res.status(500).json({ error: 'Failed to save appointment review decision' });
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
    let hasUserEdit = false;
    if ('title' in b) {
      hasUserEdit = true;
      const title = String(b.title || '').trim();
      if (!title) return res.status(400).json({ error: 'title is required' });
      doc.title = title;
    }
    if ('date' in b) { hasUserEdit = true; doc.date = normalizeNullableString(b.date); }
    if ('startDate' in b) { hasUserEdit = true; doc.startDate = normalizeNullableString(b.startDate); }
    if ('rrule' in b) { hasUserEdit = true; doc.rrule = b.rrule || ''; }
    if ('until' in b) { hasUserEdit = true; doc.until = normalizeNullableString(b.until); }
    if ('time' in b) { hasUserEdit = true; doc.time = normalizeTime(b.time); }
    if ('timeStart' in b) { hasUserEdit = true; doc.timeStart = normalizeTime(b.timeStart); }
    if ('timeEnd' in b) { hasUserEdit = true; doc.timeEnd = normalizeTime(b.timeEnd); }
    if ('location' in b) { hasUserEdit = true; doc.location = b.location || ''; }
    if ('details' in b) { hasUserEdit = true; doc.details = b.details || ''; }
    if ('cluster' in b) { hasUserEdit = true; doc.cluster = b.cluster || ''; }
    if ('tz' in b) { hasUserEdit = true; doc.tz = b.tz || 'America/Toronto'; }
    if ('entryId' in b) {
      const entryId = b.entryId ? await resolveOwnedEntryId(userId, b.entryId) : null;
      if (b.entryId && !entryId) return res.status(400).json({ error: 'entryId must reference one of your entries' });
      doc.entryId = entryId;
      hasUserEdit = true;
    }

    if ('clusters' in b || 'clusterId' in b || 'cluster' in b) {
      let clusterIds = await resolveClusterIdsForOwner(userId, b.clusters);
      if (!clusterIds.length && b.clusterId) {
        const resolved = await resolveClusterIdForOwner(userId, b.clusterId);
        if (resolved) clusterIds = [resolved];
      } else if (!clusterIds.length && b.cluster) {
        const resolved = await resolveClusterIdForOwner(userId, b.cluster);
        if (resolved) clusterIds = [resolved];
      }
      doc.clusters = clusterIds;
      hasUserEdit = true;
    }

    if (hasUserEdit && doc.source === 'entry-automation') {
      doc.source = 'user-edited';
      doc.automationReviewStatus = 'kept';
    }

    const validationError = validateAppointmentShape({
      ...doc.toObject?.() || doc,
      ...(Object.prototype.hasOwnProperty.call(b, 'time') ? { time: b.time } : {}),
      ...(Object.prototype.hasOwnProperty.call(b, 'timeStart') ? { timeStart: b.timeStart } : {}),
      ...(Object.prototype.hasOwnProperty.call(b, 'timeEnd') ? { timeEnd: b.timeEnd } : {}),
    });
    if (validationError) return res.status(400).json({ error: validationError });
    if (doc.rrule) doc.date = doc.date || null;

    await doc.save();
    res.json(doc);
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ error: 'An appointment with this title, date, and time already exists' });
    }
    logSafeError('appointments update failed', err);
    const code = err?.name === 'ValidationError' ? 400 : 500;
    res.status(code).json({ error: code === 400 ? 'Invalid appointment' : 'Failed to update appointment' });
  }
});

// ---------- DELETE ----------
router.delete('/:id', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Access denied' });
    if (!isValidId(req.params.id)) return res.status(400).json({ error: 'Invalid appointment id' });

    const appointment = await Appointment.findOne({ _id: req.params.id, userId });
    if (!appointment) return res.status(404).json({ error: 'Appointment not found' });
    if (appointment.entryId && ['entry-automation', 'user-edited'].includes(appointment.source)) {
      appointment.source = 'entry-automation';
      appointment.automationReviewStatus = 'dismissed';
      await appointment.save();
      return res.json({ ok: true, dismissed: appointment._id });
    }
    await Appointment.deleteOne({ _id: appointment._id, userId });
    res.json({ ok: true, deleted: appointment._id });
  } catch (err) {
    logSafeError('appointments delete failed', err);
    res.status(500).json({ error: 'Failed to delete appointment' });
  }
});

export default router;
