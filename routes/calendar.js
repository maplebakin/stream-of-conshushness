// routes/calendar.js
import express from 'express';
import auth from '../middleware/auth.js';
import Task from '../models/Task.js';
import Appointment from '../models/Appointment.js';       // ← adjust path if yours differs
import ImportantEvent from '../models/ImportantEvent.js';

const router = express.Router();
router.use(auth);

/* Helpers */
function getUserId(req) {
  return req.user?.userId || req.user?._id || req.user?.id;
}

function clampMonth(s) {
  // Expect "YYYY-MM"
  const m = /^(\d{4})-(\d{2})$/.exec(String(s || ''));
  if (!m) return null;
  const y = Number(m[1]);
  const mm = Number(m[2]);
  if (mm < 1 || mm > 12) return null;
  return { y, m: mm };
}

function pad2(n) { return String(n).padStart(2, '0'); }
function toISODate(y, m, d) { return `${y}-${pad2(m)}-${pad2(d)}`; } // m,d are 1-based
function daysInMonth(y, m) { return new Date(y, m, 0).getDate(); }   // m = 1..12

/** ──────────────────────────────────────────────────────────────────────────────
 * GET /api/calendar/:ym
 * Returns per-day counts for the given month.
 * Response: { days: { 'YYYY-MM-DD': { tasks, appointments, events } } }
 * ───────────────────────────────────────────────────────────────────────────── */
router.get('/:ym', async (req, res) => {
  try {
    const parsed = clampMonth(req.params.ym);
    if (!parsed) return res.status(400).json({ error: 'Invalid month. Use YYYY-MM' });

    const { y, m } = parsed;
    const userId = getUserId(req);
    const startISO = toISODate(y, m, 1);
    const endISO = toISODate(y, m, daysInMonth(y, m));

    // Fetch month data in parallel
    const [tasks, appts, impEvents] = await Promise.all([
      Task.find({
        userId,
        dueDate: { $gte: startISO, $lte: endISO }
      }).select('dueDate').lean(),

      Appointment.find({
        userId,
        date: { $gte: startISO, $lte: endISO }
      }).select('date').lean(),

      ImportantEvent.find({
        userId,
        date: { $gte: startISO, $lte: endISO }
      }).select('date').lean()
    ]);

    const days = {};
    const bump = (iso, key) => {
      if (!iso) return;
      days[iso] ??= { tasks: 0, appointments: 0, events: 0 };
      days[iso][key] += 1;
    };

    tasks.forEach(t => bump(t.dueDate, 'tasks'));
    appts.forEach(a => bump(a.date, 'appointments'));
    impEvents.forEach(e => bump(e.date, 'events'));

    res.json({ days });
  } catch (e) {
    console.error('calendar month error', e);
    res.status(500).json({ error: 'Failed to compute calendar month' });
  }
});

/** ──────────────────────────────────────────────────────────────────────────────
 * GET /api/calendar/upcoming/list?from=YYYY-MM-DD
 * Sidebar feed of upcoming appointments & important events (today and future).
 * Response: { today, appointments: [...], events: [...] }
 * Each item: { id, title, date, cluster?, daysUntil }
 * ───────────────────────────────────────────────────────────────────────────── */
router.get('/upcoming/list', async (req, res) => {
  try {
    const userId = getUserId(req);

    // from=YYYY-MM-DD; default to Toronto "today"
    const from =
      /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.from || ''))
        ? String(req.query.from)
        : new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/Toronto',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
          }).format(new Date());

    const toDate = (iso) => {
      const [yy, mm, dd] = iso.split('-').map(Number);
      return new Date(yy, (mm || 1) - 1, dd || 1);
    };
    const diffDays = (aISO, bISO) =>
      Math.round((toDate(aISO) - toDate(bISO)) / 86400000);

    const [appts, impEvents] = await Promise.all([
      Appointment.find({ userId, date: { $gte: from } })
        .select('date details _id cluster')
        .sort({ date: 1 })
        .limit(50)
        .lean(),
      ImportantEvent.find({ userId, date: { $gte: from } })
        .select('date title _id cluster')
        .sort({ date: 1 })
        .limit(50)
        .lean()
    ]);

    const appointments = appts
      .map(a => ({
        id: a._id,
        title: a.details || '(appointment)',
        date: a.date,
        cluster: a.cluster || null,
        daysUntil: diffDays(a.date, from)
      }))
      .filter(x => x.daysUntil >= 0);

    const events = impEvents
      .map(e => ({
        id: e._id,
        title: e.title,
        date: e.date,
        cluster: e.cluster || null,
        daysUntil: diffDays(e.date, from)
      }))
      .filter(x => x.daysUntil >= 0);

    res.json({ today: from, appointments, events });
  } catch (e) {
    console.error('calendar upcoming error', e);
    res.status(500).json({ error: 'Failed to load upcoming' });
  }
});

export default router;
