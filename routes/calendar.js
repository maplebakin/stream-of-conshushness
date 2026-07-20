import { Router } from 'express';
import auth from '../middleware/auth.js';
import Task from '../models/Task.js';
import ImportantEvent from '../models/ImportantEvent.js';
import {
  addDays,
  appointmentInstancesInRange,
  daysBetween,
  isISODateString,
} from '../utils/calendarInstances.js';
import { logSafeError } from '../utils/errorHandler.js';
import { resolveSourceEntries, sourceEntryMeta, sourceIdsFrom } from '../utils/sourceEntryState.js';

const r = Router();
r.use(auth);

const isISO = isISODateString;

function isYearMonth(value) {
  const match = String(value || '').match(/^(\d{4})-(0[1-9]|1[0-2])$/);
  return !!match && isISO(`${match[1]}-${match[2]}-01`);
}

function toPlainCalendarItem(item) {
  if (!item) return item;
  if (typeof item.toObject === 'function') return item.toObject();
  return { ...item };
}

async function entryMetaById(userId, items = []) {
  return resolveSourceEntries({
    userId,
    sourceIds: sourceIdsFrom(items, (item) => item?.entryId),
  });
}

function attachSourceMeta(items = [], sourceMap = new Map()) {
  return items.map((item) => {
    const plain = toPlainCalendarItem(item);
    const source = sourceEntryMeta(sourceMap, plain?.entryId);
    return { ...plain, ...source };
  });
}

// GET /api/calendar/day/:date — appointments + events + important-events for a single day
// NOTE: must be declared before /:ym to avoid route shadowing
r.get('/day/:date', async (req, res) => {
  const userId = req.user.userId;
  const date = req.params.date;
  if (!isISO(date)) {
    return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
  }
  try {
    const [rawAppointments, rawEvents] = await Promise.all([
      appointmentInstancesInRange(userId, date, date),
      ImportantEvent.find({
        userId,
        date,
        automationReviewStatus: { $nin: ['pending', 'dismissed'] },
      }).lean(),
    ]);
    const sourceMap = await entryMetaById(userId, [...rawAppointments, ...rawEvents]);
    const appointments = attachSourceMeta(rawAppointments, sourceMap);
    const events = attachSourceMeta(rawEvents, sourceMap);
    // /api/events and /api/important-events share the same model; return once as both keys
    res.json({ appointments, events, importantEvents: events });
  } catch (e) {
    logSafeError('calendar day failed', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/calendar/upcoming/list?from=YYYY-MM-DD
// NOTE: must be declared before /:ym to avoid route shadowing
r.get('/upcoming/list', async (req, res) => {
  const userId = req.user.userId;
  const from = req.query.from;
  if (!from) return res.json({ appointments: [], events: [], today: '' });
  if (!isISO(from)) return res.status(400).json({ error: 'from must be YYYY-MM-DD' });
  try {
    const horizon = addDays(from, 60);
    const [appts, events] = await Promise.all([
      appointmentInstancesInRange(userId, from, horizon),
      ImportantEvent.find({
        userId,
        date: { $gte: from, $lte: horizon },
        automationReviewStatus: { $nin: ['pending', 'dismissed'] },
      }).sort({ date: 1 }),
    ]);
    const daysUntil = (iso) => daysBetween(from, iso);
    res.json({
      today: from,
      appointments: appts.map(a => ({
        id: a._id,
        title: a.title,
        date: a.date,
        time: a.time || null,
        timeStart: a.timeStart || null,
        timeEnd: a.timeEnd || null,
        location: a.location || '',
        details: a.details || '',
        rrule: a.rrule || '',
        startDate: a.startDate || null,
        until: a.until || null,
        tz: a.tz || 'America/Toronto',
        daysUntil: daysUntil(a.date),
        ...(a.isRecurring ? { isRecurring: true, seriesId: a.seriesId } : {}),
      })),
      events: events.map(e => ({ id: e._id, title: e.title, date: e.date, daysUntil: daysUntil(e.date) })),
    });
  } catch (error) {
    logSafeError('calendar upcoming failed', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/calendar/:ym  (ym = YYYY-MM)
r.get('/:ym', async (req, res) => {
  const userId = req.user.userId;
  const ym = req.params.ym;
  if (!isYearMonth(ym)) {
    return res.status(400).json({ error: 'month must be YYYY-MM' });
  }

  try {
    const [year, month] = ym.split('-').map(Number);
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const from = `${ym}-01`;
    const to   = `${ym}-${String(lastDay).padStart(2, '0')}`;
    const [tasks, appts, events] = await Promise.all([
      Task.find({
        userId,
        deletedAt: null,
        completed: false,
        dueDate: { $gte: from, $lte: to },
      }, 'dueDate'),
      appointmentInstancesInRange(userId, from, to),
      ImportantEvent.find({
        userId,
        date: { $gte: from, $lte: to },
        automationReviewStatus: { $nin: ['pending', 'dismissed'] },
      }, 'date'),
    ]);
    const days = {};
    for (const t of tasks) { if (!t.dueDate) continue; (days[t.dueDate] ||= {tasks:0,appointments:0,events:0}).tasks++; }
    for (const a of appts) { if (!a.date) continue;   (days[a.date]   ||= {tasks:0,appointments:0,events:0}).appointments++; }
    for (const e of events) { if (!e.date) continue;  (days[e.date]   ||= {tasks:0,appointments:0,events:0}).events++; }
    res.json({ days });
  } catch (error) {
    logSafeError('calendar month failed', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default r;
