import express from 'express';
import mongoose from 'mongoose';
import auth from '../middleware/auth.js';
import Task from '../models/Task.js';
import Appointment from '../models/Appointment.js';
import ImportantEvent from '../models/ImportantEvent.js';

const router = express.Router();

/* ───────── helpers ───────── */
function getUserId(req) {
  return req.user?.userId || req.user?._id || req.user?.id;
}
function iso(y, m, d) {
  const mm = String(m).padStart(2, '0');
  const dd = String(d).padStart(2, '0');
  return `${y}-${mm}-${dd}`;
}
function lastDayOfMonth(year, month1to12) {
  return new Date(year, month1to12, 0).getDate();
}
function todayISOInToronto() {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric', month: '2-digit', day: '2-digit'
  });
  const p = fmt.formatToParts(new Date());
  const y = p.find(x => x.type === 'year').value;
  const m = p.find(x => x.type === 'month').value;
  const d = p.find(x => x.type === 'day').value;
  return `${y}-${m}-${d}`;
}
function daysBetween(aISO, bISO) {
  const [ay, am, ad] = aISO.split('-').map(Number);
  const [by, bm, bd] = bISO.split('-').map(Number);
  const a = new Date(ay, (am || 1) - 1, ad || 1);
  const b = new Date(by, (bm || 1) - 1, bd || 1);
  return Math.round((a - b) / (1000 * 60 * 60 * 24));
}

/* ──────────────────────────────────────────────────────────────────────────────
   GET /api/calendar/:month   (month = "YYYY-MM")
   Returns per-day counts for badges on the month grid.

   Response:
   {
     range: { start, end },
     days: {
       "YYYY-MM-DD": { tasks, appointments, events }
     },
     // optional passthrough if you add ?raw=1 for debugging:
     raw?: { tasks: [...], appointments: [...], importantEvents: [...] }
   }
────────────────────────────────────────────────────────────────────────────── */
router.get('/:month', auth, async (req, res) => {
  try {
    const uid = getUserId(req);
    if (!uid) return res.status(401).json({ error: 'Unauthorized' });

    const [yearStr, monStr] = String(req.params.month || '').split('-');
    const year = Number(yearStr);
    const month = Number(monStr); // 1..12
    if (!year || !month || month < 1 || month > 12) {
      return res.status(400).json({ error: 'Invalid month param. Use YYYY-MM' });
    }

    const start = iso(year, month, 1);
    const end = iso(year, month, lastDayOfMonth(year, month));

    // Aggregate counts per day (strings "YYYY-MM-DD" compare lexicographically fine)
    const userObjId = new mongoose.Types.ObjectId(uid);

    const tasksAgg = Task.aggregate([
      { $match: {
          userId: userObjId,
          completed: false,
          dueDate: { $gte: start, $lte: end }
      }},
      { $group: { _id: '$dueDate', count: { $sum: 1 } } }
    ]);

    const apptAgg = Appointment.aggregate([
      { $match: {
          userId: userObjId,
          date: { $gte: start, $lte: end }
      }},
      { $group: { _id: '$date', count: { $sum: 1 } } }
    ]);

    const eventAgg = ImportantEvent.aggregate([
      { $match: {
          userId: userObjId,
          date: { $gte: start, $lte: end }
      }},
      { $group: { _id: '$date', count: { $sum: 1 } } }
    ]);

    const [tCounts, aCounts, eCounts] = await Promise.all([tasksAgg, apptAgg, eventAgg]);

    const days = {};
    for (const t of tCounts) {
      days[t._id] ??= { tasks: 0, appointments: 0, events: 0 };
      days[t._id].tasks = t.count;
    }
    for (const a of aCounts) {
      days[a._id] ??= { tasks: 0, appointments: 0, events: 0 };
      days[a._id].appointments = a.count;
    }
    for (const e of eCounts) {
      days[e._id] ??= { tasks: 0, appointments: 0, events: 0 };
      days[e._id].events = e.count;
    }

    // Optionally include raw docs for debugging if ?raw=1
    if (req.query.raw === '1') {
      const [tasksRaw, appointmentsRaw, eventsRaw] = await Promise.all([
        Task.find({ userId: uid, completed: false, dueDate: { $gte: start, $lte: end } }).lean(),
        Appointment.find({ userId: uid, date: { $gte: start, $lte: end } }).lean(),
        ImportantEvent.find({ userId: uid, date: { $gte: start, $lte: end } }).lean(),
      ]);
      return res.json({ range: { start, end }, days, raw: {
        tasks: tasksRaw, appointments: appointmentsRaw, importantEvents: eventsRaw
      } });
    }

    res.json({ range: { start, end }, days });
  } catch (err) {
    console.error('❌ calendar/:month error:', err);
    res.status(500).json({ error: 'Failed to load calendar data' });
  }
});

/* ──────────────────────────────────────────────────────────────────────────────
   GET /api/calendar/upcoming?from=YYYY-MM-DD&window=60&limit=20
   Sidebar feed: countdowns for important events and appointments.
   Items that are in the past are omitted automatically.
────────────────────────────────────────────────────────────────────────────── */
router.get('/upcoming/list', auth, async (req, res) => {
  try {
    const uid = getUserId(req);
    if (!uid) return res.status(401).json({ error: 'Unauthorized' });

    const today = todayISOInToronto();
    const from = req.query.from || today;
    const windowDays = Math.max(1, Number(req.query.window || 60));
    const limit = Math.max(1, Number(req.query.limit || 20));

    // Compute inclusive end date
    const [y, m, d] = from.split('-').map(Number);
    const dt = new Date(y, (m || 1) - 1, d || 1);
    dt.setDate(dt.getDate() + windowDays);
    const end = iso(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());

    const [appts, events] = await Promise.all([
      Appointment.find(
        { userId: uid, date: { $gte: from, $lte: end } },
        { title: 1, date: 1 }
      ).sort({ date: 1 }).limit(limit).lean(),
      ImportantEvent.find(
        { userId: uid, date: { $gte: from, $lte: end } },
        { title: 1, name: 1, date: 1 }
      ).sort({ date: 1 }).limit(limit).lean()
    ]);

    const appointments = appts.map(a => ({
      id: a._id,
      title: a.title || 'Appointment',
      date: a.date,
      daysUntil: daysBetween(a.date, today)
    })).filter(a => a.daysUntil >= 0);

    const importantEvents = events.map(e => ({
      id: e._id,
      title: e.title || e.name || 'Important event',
      date: e.date,
      daysUntil: daysBetween(e.date, today)
    })).filter(e => e.daysUntil >= 0);

    res.json({ today, appointments, events: importantEvents });
  } catch (err) {
    console.error('❌ calendar/upcoming error:', err);
    res.status(500).json({ error: 'Failed to load upcoming items' });
  }
});

export default router;
