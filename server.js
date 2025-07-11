console.log('🛠️  Starting Stream of Conshushness server…');

const express = require('express');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = 3000;

const ENTRIES_FILE = path.join(__dirname, 'data', 'entries.json');
const CALENDAR_FILE = path.join(__dirname, 'data', 'calendar.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

console.log('🟢 server.js loaded and routes will be registered');

// ─── Middleware ─────────────────────────────
app.use(express.json());

// Simple logger
app.use((req, res, next) => {
  console.log(`🌐  ${req.method} ${req.url}`);
  next();
});

// ─── Journal Entry Routes ───────────────────
// GET all journal entries
app.get('/api/entries', (req, res) => {
  try {
    const data = fs.readFileSync(ENTRIES_FILE, 'utf8');
    let parsed = JSON.parse(data);
    if (!Array.isArray(parsed)) {
      console.warn('⚠️ entries.json is not an array! Returning empty array.');
      return res.json([]);
    }
    res.json(parsed);
  } catch {
    res.json([]);
  }
});


// POST new journal entry
app.post('/api/add-entry', (req, res) => {
  let entries = [];
  try {
    entries = JSON.parse(fs.readFileSync(ENTRIES_FILE, 'utf8'));
  } catch {}
  const newEntry = { id: uuidv4(), ...req.body };
  entries.unshift(newEntry);
  fs.writeFileSync(ENTRIES_FILE, JSON.stringify(entries, null, 2));
  res.json(newEntry);
});

// PUT edit entry
app.put('/api/edit-entry/:id', (req, res) => {
  const id = req.params.id;
  let entries = [];
  try {
    entries = JSON.parse(fs.readFileSync(ENTRIES_FILE, 'utf8'));
  } catch {}
  let found = false;
  entries = entries.map(e => {
    if (e.id === id) {
      found = true;
      return { ...e, ...req.body, id };
    }
    return e;
  });
  if (!found) return res.status(404).json({ error: 'Entry not found.' });
  fs.writeFileSync(ENTRIES_FILE, JSON.stringify(entries, null, 2));
  res.json({ message: 'Entry updated successfully!' });
});

// DELETE entry
app.delete('/api/delete-entry/:id', (req, res) => {
  const id = req.params.id;
  let entries = [];
  try {
    entries = JSON.parse(fs.readFileSync(ENTRIES_FILE, 'utf8'));
  } catch {}
  const filtered = entries.filter(e => e.id !== id);
  if (filtered.length === entries.length) {
    return res.status(404).json({ error: 'Entry not found.' });
  }
  fs.writeFileSync(ENTRIES_FILE, JSON.stringify(filtered, null, 2));
  res.json({ message: 'Entry deleted successfully!' });
});

// ─── Calendar Routes ─────────────────────────
// GET appointments for a specific day
app.get('/api/appointments/:date', (req, res) => {
  const { date } = req.params;

  let calendar = {};
  try {
    calendar = JSON.parse(fs.readFileSync(CALENDAR_FILE, 'utf8'));
  } catch {
    return res.json({});
  }

  const [yyyy, mm] = date.split('-');
  const monthKey = `${yyyy}-${String(mm).padStart(2, '0')}`;
  const dayData = calendar[monthKey]?.days?.[date];

  if (!dayData || !dayData.schedule) {
    return res.json({});
  }

  res.json(dayData.schedule);
});

// POST add appointment
app.post('/api/add-appointment', (req, res) => {
  const { date, time, details } = req.body;
  if (!date || !time || !details) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  let calendar = {};
  try {
    calendar = JSON.parse(fs.readFileSync(CALENDAR_FILE, 'utf8'));
  } catch {}

  const [yyyy, mm] = date.split('-');
  const monthKey = `${yyyy}-${String(mm).padStart(2, '0')}`;

  if (!calendar[monthKey]) {
    calendar[monthKey] = { dailyNotes: {}, importantEvents: [], days: {} };
  }

  if (!calendar[monthKey].days[date]) {
    calendar[monthKey].days[date] = { schedule: {}, freeForm: [] };
  }

  calendar[monthKey].days[date].schedule[time] = details;

  fs.writeFileSync(CALENDAR_FILE, JSON.stringify(calendar, null, 2));
  console.log(`✅ Added appointment on ${date} at ${time}: ${details}`);
  res.json({ success: true, date, time, details });
});

// PUT edit appointment
app.put('/api/edit-appointment', (req, res) => {
  const { date, time, newDetails } = req.body;
  if (!date || !time || !newDetails) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  let calendar = {};
  try {
    calendar = JSON.parse(fs.readFileSync(CALENDAR_FILE, 'utf8'));
  } catch {
    return res.status(500).json({ error: 'Server error reading data' });
  }

  const [yyyy, mm] = date.split('-');
  const monthKey = `${yyyy}-${String(mm).padStart(2, '0')}`;

  if (
    !calendar[monthKey] ||
    !calendar[monthKey].days[date] ||
    !calendar[monthKey].days[date].schedule[time]
  ) {
    return res.status(404).json({ error: 'Appointment not found' });
  }

  calendar[monthKey].days[date].schedule[time] = newDetails;

  fs.writeFileSync(CALENDAR_FILE, JSON.stringify(calendar, null, 2));
  console.log(`✅ Edited appointment on ${date} at ${time}: ${newDetails}`);
  res.json({ success: true });
});

// DELETE appointment
app.delete('/api/delete-appointment', (req, res) => {
  const { date, time } = req.body;
  if (!date || !time) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  let calendar = {};
  try {
    calendar = JSON.parse(fs.readFileSync(CALENDAR_FILE, 'utf8'));
  } catch {
    return res.status(500).json({ error: 'Server error reading data' });
  }

  const [yyyy, mm] = date.split('-');
  const monthKey = `${yyyy}-${String(mm).padStart(2, '0')}`;

  if (
    !calendar[monthKey] ||
    !calendar[monthKey].days[date] ||
    !calendar[monthKey].days[date].schedule[time]
  ) {
    return res.status(404).json({ error: 'Appointment not found' });
  }

  delete calendar[monthKey].days[date].schedule[time];

  fs.writeFileSync(CALENDAR_FILE, JSON.stringify(calendar, null, 2));
  console.log(`🗑️ Deleted appointment on ${date} at ${time}`);
  res.json({ success: true });
});

// ─── Important Events Routes ─────────────────────────

// GET important events for a specific date
app.get('/api/important-events/date/:date', (req, res) => {
  const { date } = req.params;
  try {
    const calendar = JSON.parse(fs.readFileSync(CALENDAR_FILE, 'utf8'));
    const [yyyy, mm] = date.split('-');
    const monthKey = `${yyyy}-${String(mm).padStart(2, '0')}`;
    const monthData = calendar[monthKey] || {};
    const events = (monthData.importantEvents || []).filter(ev => ev.date === date);
    res.json(events);
  } catch {
    res.status(500).json({ error: 'Failed to read calendar data.' });
  }
});

// GET important events for a month
app.get('/api/important-events/:month', (req, res) => {
  const month = req.params.month;
  try {
    const calendar = JSON.parse(fs.readFileSync(CALENDAR_FILE, 'utf8'));
    const monthData = calendar[month] || {};
    res.json(monthData.importantEvents || []);
  } catch {
    res.status(500).json({ error: 'Failed to read calendar data.' });
  }
});

// POST new important event
app.post('/api/important-events', (req, res) => {
  const { month, title, date } = req.body;
  if (!month || !title || !date) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  let calendar = {};
  try {
    calendar = JSON.parse(fs.readFileSync(CALENDAR_FILE, 'utf8'));
  } catch {}

  if (!calendar[month]) {
    calendar[month] = { days: {}, importantEvents: [] };
  }

  if (!calendar[month].importantEvents) {
    calendar[month].importantEvents = [];
  }

  const newEvent = {
    id: uuidv4(),
    title,
    date
  };

  calendar[month].importantEvents.push(newEvent);

  fs.writeFileSync(CALENDAR_FILE, JSON.stringify(calendar, null, 2));
  console.log(`✅ Added important event to ${month}: ${title} on ${date}`);
  res.json(newEvent);
});

// DELETE important event
app.delete('/api/important-events/:month/:id', (req, res) => {
  const { month, id } = req.params;
  let calendar = {};
  try {
    calendar = JSON.parse(fs.readFileSync(CALENDAR_FILE, 'utf8'));
  } catch {
    return res.status(500).json({ error: 'Server error reading data' });
  }

  if (!calendar[month] || !calendar[month].importantEvents) {
    return res.status(404).json({ error: 'Month or events not found.' });
  }

  const original = calendar[month].importantEvents.length;
  calendar[month].importantEvents = calendar[month].importantEvents.filter(e => e.id !== id);

  if (calendar[month].importantEvents.length === original) {
    return res.status(404).json({ error: 'Event not found.' });
  }

  fs.writeFileSync(CALENDAR_FILE, JSON.stringify(calendar, null, 2));
  console.log(`🗑️ Deleted important event ${id} from ${month}`);
  res.json({ success: true });
});

// ─── Static files AFTER API routes ───────────
app.use('/data', express.static(path.join(__dirname, 'data')));
app.use(express.static(PUBLIC_DIR));

// SPA catch-all
app.use((req, res, next) => {
  if (req.method !== 'GET') return next();
  if (req.path.includes('.')) return next();
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// ─── Start server ─────────────────────────────
app.listen(PORT, () => {
  console.log(`🌿  Listening on http://localhost:${PORT}`);
});
