import { Router } from 'express';
import auth from '../middleware/auth.js';
import Task from '../models/Task.js';
import Appointment from '../models/Appointment.js';
import ImportantEvent from '../models/ImportantEvent.js';

const r = Router();
r.use(auth);

// GET /api/calendar/day/:date — appointments + events + important-events for a single day
// NOTE: must be declared before /:ym to avoid route shadowing
r.get('/day/:date', async (req, res) => {
  const userId = req.user.userId;
  const date = req.params.date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
  }
  try {
    const [appointments, events] = await Promise.all([
      Appointment.find({ userId, date }).lean(),
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
  const addDays = (iso, n) => { const d=new Date(iso); d.setDate(d.getDate()+n);
    return [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-');
  };
  const horizon = addDays(from, 60);
  const [appts, events] = await Promise.all([
    Appointment.find({ userId, date: { $gte: from, $lte: horizon } }).sort({ date: 1 }),
    ImportantEvent.find({ userId, date: { $gte: from, $lte: horizon } }).sort({ date: 1 }),
  ]);
  const daysUntil = (iso) => Math.round((new Date(iso) - new Date(from)) / 86400000);
  res.json({
    today: from,
    appointments: appts.map(a => ({ id: a._id, title: a.title, date: a.date, daysUntil: daysUntil(a.date) })),
    events: events.map(e => ({ id: e._id, title: e.title, date: e.date, daysUntil: daysUntil(e.date) })),
  });
});

// GET /api/calendar/:ym  (ym = YYYY-MM)
r.get('/:ym', async (req, res) => {
  const userId = req.user.userId;
  const ym = req.params.ym;
  const from = `${ym}-01`;
  const to   = `${ym}-31`;
  const [tasks, appts, events] = await Promise.all([
    Task.find({ userId, dueDate: { $gte: from, $lte: to } }, 'dueDate'),
    Appointment.find({ userId, date: { $gte: from, $lte: to } }, 'date'),
    ImportantEvent.find({ userId, date: { $gte: from, $lte: to } }, 'date'),
  ]);
  const days = {};
  for (const t of tasks) { if (!t.dueDate) continue; (days[t.dueDate] ||= {tasks:0,appointments:0,events:0}).tasks++; }
  for (const a of appts) { if (!a.date) continue;   (days[a.date]   ||= {tasks:0,appointments:0,events:0}).appointments++; }
  for (const e of events) { if (!e.date) continue;  (days[e.date]   ||= {tasks:0,appointments:0,events:0}).events++; }
  res.json({ days });
});

export default r;
