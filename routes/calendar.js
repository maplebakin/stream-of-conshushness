import { Router } from 'express';
import auth from '../middleware/auth.js';
import Task from '../models/Task.js';
import Appointment from '../models/Appointment.js';
import ImportantEvent from '../models/ImportantEvent.js';
import { expandDatesInRange } from '../utils/recurrence.js';

const r = Router();
r.use(auth);

function isISO(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
}

function addDays(iso, n) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return [
    d.getUTCFullYear(),
    String(d.getUTCMonth() + 1).padStart(2, '0'),
    String(d.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

function recurringInstance(series, date, userId) {
  return {
    _id: `virtual:${series._id}:${date}`,
    userId,
    title: series.title,
    date,
    rrule: series.rrule,
    startDate: series.startDate,
    until: series.until,
    tz: series.tz || 'America/Toronto',
    time: series.time || null,
    timeStart: series.timeStart || null,
    timeEnd: series.timeEnd || null,
    location: series.location || '',
    details: series.details || '',
    cluster: series.cluster || '',
    clusters: Array.isArray(series.clusters) ? series.clusters : [],
    entryId: series.entryId || null,
    isRecurring: true,
    seriesId: series._id,
  };
}

async function appointmentInstancesInRange(userId, from, to) {
  const oneOffs = await Appointment.find({
    userId,
    date: { $gte: from, $lte: to },
    rrule: '',
  });

  const series = await Appointment.find({
    userId,
    rrule: { $ne: '' },
    startDate: { $lte: to },
    $or: [{ until: null }, { until: { $gte: from } }, { until: '' }],
  });

  const virtuals = [];
  for (const item of series) {
    const expandTo = item.until && item.until < to ? item.until : to;
    const dates = expandDatesInRange(item.rrule, item.startDate, from, expandTo);
    for (const date of dates) {
      virtuals.push(recurringInstance(item, date, userId));
    }
  }

  const seen = new Set(oneOffs.map((a) => `${a.date}|${a.timeStart || ''}|${a.title}`));
  const dedupedVirtuals = virtuals.filter((v) => !seen.has(`${v.date}|${v.timeStart || ''}|${v.title}`));

  return [...oneOffs, ...dedupedVirtuals].sort((a, b) => {
    const ka = `${a.date || ''}T${a.timeStart || a.time || '99:99'}`;
    const kb = `${b.date || ''}T${b.timeStart || b.time || '99:99'}`;
    return ka.localeCompare(kb);
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
    const [appointments, events] = await Promise.all([
      appointmentInstancesInRange(userId, date, date),
      ImportantEvent.find({ userId, date }).lean(),
    ]);
    // /api/events and /api/important-events share the same model; return once as both keys
    res.json({ appointments, events, importantEvents: events });
  } catch (e) {
    console.error('[calendar/day] error', e);
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
  const horizon = addDays(from, 60);
  const [appts, events] = await Promise.all([
    appointmentInstancesInRange(userId, from, horizon),
    ImportantEvent.find({ userId, date: { $gte: from, $lte: horizon } }).sort({ date: 1 }),
  ]);
  const daysUntil = (iso) => Math.round((new Date(iso) - new Date(from)) / 86400000);
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
});

// GET /api/calendar/:ym  (ym = YYYY-MM)
r.get('/:ym', async (req, res) => {
  const userId = req.user.userId;
  const ym = req.params.ym;
  const [year, month] = ym.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const from = `${ym}-01`;
  const to   = `${ym}-${String(lastDay).padStart(2, '0')}`;
  const [tasks, appts, events] = await Promise.all([
    Task.find({ userId, dueDate: { $gte: from, $lte: to } }, 'dueDate'),
    appointmentInstancesInRange(userId, from, to),
    ImportantEvent.find({ userId, date: { $gte: from, $lte: to } }, 'date'),
  ]);
  const days = {};
  for (const t of tasks) { if (!t.dueDate) continue; (days[t.dueDate] ||= {tasks:0,appointments:0,events:0}).tasks++; }
  for (const a of appts) { if (!a.date) continue;   (days[a.date]   ||= {tasks:0,appointments:0,events:0}).appointments++; }
  for (const e of events) { if (!e.date) continue;  (days[e.date]   ||= {tasks:0,appointments:0,events:0}).events++; }
  res.json({ days });
});

export default r;
