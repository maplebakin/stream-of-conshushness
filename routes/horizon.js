import { Router } from 'express';
import auth from '../middleware/auth.js';
import ImportantEvent from '../models/ImportantEvent.js';
import {
  addDays,
  appointmentInstancesInRange,
  countdownLabel,
  daysBetween,
  displayLabelFor,
  isISODateString,
} from '../utils/calendarInstances.js';
import { todayISOInTZ } from '../utils/date.js';
import { logSafeError } from '../utils/errorHandler.js';
import { resolveSourceEntries, sourceEntryMeta, sourceIdsFrom } from '../utils/sourceEntryState.js';

const router = Router();
router.use(auth);

function userIdOf(req) {
  return req.user?.userId || req.user?._id || req.user?.id;
}

function clamp(value, fallback, min, max) {
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

async function resolveQuery(query) {
  if (!query) return [];
  if (query.lean) return query.lean();
  return query;
}

function baseItemFields({ item, type, from, source }) {
  const daysUntil = daysBetween(from, item.date);
  const label = countdownLabel(daysUntil);
  const entryId = item.entryId ? String(item.entryId) : null;
  return {
    id: String(item._id || item.id || ''),
    type,
    title: item.title || '',
    date: item.date,
    time: item.timeStart || item.time || null,
    timeStart: item.timeStart || null,
    timeEnd: item.timeEnd || null,
    daysUntil,
    countdownLabel: label,
    displayLabel: displayLabelFor(item.title || '', daysUntil),
    entryId,
    sourceEntryId: entryId,
    ...source,
    sourceText: source?.sourceAvailable ? source.sourceEntryExcerpt || '' : '',
    cluster: item.cluster || '',
    clusters: Array.isArray(item.clusters) ? item.clusters : [],
  };
}

function sortHorizonItems(a, b) {
  const ka = `${a.date || ''}T${a.time || '99:99'}|${a.title || ''}`;
  const kb = `${b.date || ''}T${b.time || '99:99'}|${b.title || ''}`;
  return ka.localeCompare(kb);
}

router.get('/', async (req, res) => {
  const userId = userIdOf(req);
  if (!userId) return res.status(401).json({ error: 'Access denied' });

  const from = isISODateString(req.query.from) ? String(req.query.from) : todayISOInTZ();
  const days = clamp(req.query.days, 60, 1, 365);
  const limit = req.query.limit == null ? null : clamp(req.query.limit, 20, 1, 500);
  const to = addDays(from, days);

  try {
    const [appointments, eventQuery] = await Promise.all([
      appointmentInstancesInRange(userId, from, to),
      ImportantEvent.find({
        userId,
        date: { $gte: from, $lte: to },
        automationReviewStatus: { $nin: ['pending', 'dismissed'] },
      }).sort({ date: 1, createdAt: 1 }),
    ]);
    const events = await resolveQuery(eventQuery);

    const sourceEntries = await resolveSourceEntries({
      userId,
      sourceIds: sourceIdsFrom([...appointments, ...(events || [])], (item) => item.entryId || item.sourceEntryId),
    });

    const appointmentItems = (appointments || []).map((appointment) => {
      const source = sourceEntryMeta(sourceEntries, appointment.entryId, { includeExcerpt: true });
      return {
        ...baseItemFields({ item: appointment, type: 'appointment', from, source }),
        location: appointment.location || '',
        details: appointment.details || '',
        rrule: appointment.rrule || '',
        startDate: appointment.startDate || null,
        until: appointment.until || null,
        tz: appointment.tz || 'America/Toronto',
        isRecurringInstance: !!appointment.isRecurring,
        isRecurring: !!appointment.isRecurring || !!appointment.rrule,
        seriesId: appointment.seriesId ? String(appointment.seriesId) : null,
      };
    });

    const eventItems = (events || []).map((event) => {
      const source = sourceEntryMeta(sourceEntries, event.entryId, { includeExcerpt: true });
      return {
        ...baseItemFields({ item: event, type: 'importantEvent', from, source }),
        description: event.description || '',
        pinned: !!event.pinned,
      };
    });

    let items = [...appointmentItems, ...eventItems]
      .filter((item) => Number.isFinite(item.daysUntil) && item.daysUntil >= 0)
      .sort(sortHorizonItems);

    if (limit) items = items.slice(0, limit);

    res.json({ today: from, from, to, days, items });
  } catch (err) {
    logSafeError('horizon load failed', err);
    res.status(500).json({ error: 'Failed to load horizon items' });
  }
});

export default router;
