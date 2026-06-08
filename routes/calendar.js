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

const r = Router();
r.use(auth);

const isISO = isISODateString;

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
