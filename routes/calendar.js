import { Router } from 'express';
import auth from '../middleware/auth.js';
import Task from '../models/Task.js';
import Appointment from '../models/Appointment.js';
import ImportantEvent from '../models/ImportantEvent.js';

const r = Router();
r.use(auth);

const isYMD = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const formatYmd = (date) => [
  date.getFullYear(),
  String(date.getMonth() + 1).padStart(2, '0'),
  String(date.getDate()).padStart(2, '0'),
].join('-');

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

// GET /api/calendar/upcoming/list?from=YYYY-MM-DD
r.get('/upcoming/list', async (req, res) => {
  const userId = req.user.userId;
  const fromRaw = req.query.from;
  if (!isYMD(fromRaw)) return res.status(400).json({ error: 'from must be YYYY-MM-DD' });

  const fromDate = new Date(fromRaw);
  if (Number.isNaN(fromDate.getTime())) {
    return res.status(400).json({ error: 'from must be a valid date' });
  }

  const addDays = (date, n) => { const d = new Date(date); d.setDate(d.getDate() + n); return formatYmd(d); };
  const from = formatYmd(fromDate);
  const horizon = addDays(fromDate, 60);
  const [appts, events] = await Promise.all([
    Appointment.find({ userId, date: { $gte: from, $lte: horizon } }).sort({ date: 1 }),
    ImportantEvent.find({ userId, date: { $gte: from, $lte: horizon } }).sort({ date: 1 }),
  ]);
  const daysUntil = (iso) => Math.round((new Date(iso) - fromDate) / 86400000);
  res.json({
    today: from,
    appointments: appts.map(a => ({ id: a._id, title: a.title, date: a.date, daysUntil: daysUntil(a.date) })),
    events: events.map(e => ({ id: e._id, title: e.title, date: e.date, daysUntil: daysUntil(e.date) })),
  });
});

export default r;
