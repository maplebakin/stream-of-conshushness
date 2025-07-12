console.log('🛠️  Starting Stream of Conshushness server…');

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

import User from './models/User.js';
import Entry from './models/Entry.js';
import Appointment from './models/Appointment.js';
import ImportantEvent from './models/ImportantEvent.js';
import Note from './models/Note.js';
import Todo from './models/Todo.js';

// Load .env variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// App
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Connect to MongoDB Atlas
(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB Atlas');
  } catch (err) {
    console.error('❌ MongoDB connection error:', err);
  }
})();


// ─── AUTH ─────────────────────────────
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.status(401).json({ error: 'Missing token' });

  const token = authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Invalid token format' });

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token' });
    req.user = user;
    next();
  });
}

// ─── User Routes ─────────────────────────────
app.get('/health', (req, res) => res.send('OK'));

app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

  try {
    const existing = await User.findOne({ username });
    if (existing) return res.status(400).json({ error: 'Username already taken' });

    const passwordHash = await bcrypt.hash(password, 10);
    const newUser = new User({ username, passwordHash });
    await newUser.save();

    console.log(`✅ Registered new user: ${username}`);
    res.json({ success: true, message: 'User registered successfully' });
  } catch (err) {
    console.error('Error in /api/register:', err);
    res.status(500).json({ error: 'Server error during registration' });
  }
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

  try {
    const user = await User.findOne({ username });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign(
      { userId: user._id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    console.log(`✅ User logged in: ${username}`);
    res.json({ success: true, token });
  } catch (err) {
    console.error('Error in /api/login:', err);
    res.status(500).json({ error: 'Server error during login' });    
  }
});

// ─── Logger ─────────────────────────────
app.use((req, res, next) => {
  console.log(`🌐  ${req.method} ${req.url}`);
  next();
});

// ─── Journal Entry Routes ─────────────────────────────
app.get('/api/entries', authenticateToken, async (req, res) => {
  try {
    const entries = await Entry.find({ userId: req.user.userId }).sort({ createdAt: -1 });
    res.json(entries);
  } catch (err) {
    console.error('Error fetching entries:', err);
    res.status(500).json({ error: 'Server error fetching entries' });
  }
});

app.post('/api/add-entry', authenticateToken, async (req, res) => {
  const { date, section, tags, content } = req.body;
  if (!date || !section || !content) return res.status(400).json({ error: 'Missing fields' });

  try {
    const newEntry = new Entry({ userId: req.user.userId, date, section, tags: tags || [], content });
    await newEntry.save();

    console.log(`✅ Added new entry for user ${req.user.userId}`);
    res.json(newEntry);
  } catch (err) {
    console.error('Error adding entry:', err);
    res.status(500).json({ error: 'Server error adding entry' });
  }
});

app.put('/api/edit-entry/:id', authenticateToken, async (req, res) => {
  const { date, section, tags, content } = req.body;
  if (!date || !section || !content) return res.status(400).json({ error: 'Missing fields' });

  try {
    const updated = await Entry.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.userId },
      { date, section, tags: tags || [], content },
      { new: true }
    );

    if (!updated) return res.status(404).json({ error: 'Entry not found or not authorized' });

    console.log(`✅ Edited entry ${req.params.id} for user ${req.user.userId}`);
    res.json(updated);
  } catch (err) {
    console.error('Error editing entry:', err);
    res.status(500).json({ error: 'Server error editing entry' });
  }
});

app.delete('/api/delete-entry/:id', authenticateToken, async (req, res) => {
  try {
    const deleted = await Entry.findOneAndDelete({ _id: req.params.id, userId: req.user.userId });
    if (!deleted) return res.status(404).json({ error: 'Entry not found or not authorized' });

    console.log(`🗑️ Deleted entry ${req.params.id} for user ${req.user.userId}`);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting entry:', err);
    res.status(500).json({ error: 'Server error deleting entry' });
  }
});

// ─── Calendar Routes ─────────────────────────────
app.get('/api/calendar-data', authenticateToken, async (req, res) => {
  try {
    const appointments = await Appointment.find({ userId: req.user.userId });
    const importantEvents = await ImportantEvent.find({ userId: req.user.userId });
    res.json({ appointments, importantEvents });
  } catch (err) {
    console.error('Error fetching calendar data:', err);
    res.status(500).json({ error: 'Server error fetching calendar data' });
  }
});

app.get('/api/appointments/:date', authenticateToken, async (req, res) => {
  try {
    const appointments = await Appointment.find({ userId: req.user.userId, date: req.params.date }).sort({ time: 1 });
    res.json(appointments);
  } catch (err) {
    console.error('Error fetching appointments:', err);
    res.status(500).json({ error: 'Server error fetching appointments' });
  }
});
app.get('/api/important-events/:month', authenticateToken, async (req, res) => {
  try {
    const events = await ImportantEvent.find({
      userId: req.user.userId,
      date: { $regex: `^${req.params.month}` }
    }).sort({ date: 1 });

    res.json(events);
  } catch (err) {
    console.error('Error fetching events for month:', err);
    res.status(500).json({ error: 'Server error fetching events for month' });
  }
});

app.post('/api/add-appointment', authenticateToken, async (req, res) => {
  const { date, time, details } = req.body;
  if (!date || !time || !details) return res.status(400).json({ error: 'Missing fields' });

  try {
    const newAppointment = new Appointment({ userId: req.user.userId, date, time, details });
    await newAppointment.save();

    console.log(`✅ Added appointment for user ${req.user.userId} on ${date} at ${time}`);
    res.json(newAppointment);
  } catch (err) {
    console.error('Error adding appointment:', err);
    res.status(500).json({ error: 'Server error adding appointment' });
  }
});

app.put('/api/edit-appointment/:id', authenticateToken, async (req, res) => {
  const { date, time, details } = req.body;
  if (!date || !time || !details) return res.status(400).json({ error: 'Missing fields' });

  try {
    const updated = await Appointment.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.userId },
      { date, time, details },
      { new: true }
    );

    if (!updated) return res.status(404).json({ error: 'Appointment not found or not authorized' });

    console.log(`✅ Edited appointment ${req.params.id} for user ${req.user.userId}`);
    res.json(updated);
  } catch (err) {
    console.error('Error editing appointment:', err);
    res.status(500).json({ error: 'Server error editing appointment' });
  }
});

app.delete('/api/delete-appointment/:id', authenticateToken, async (req, res) => {
  try {
    const deleted = await Appointment.findOneAndDelete({ _id: req.params.id, userId: req.user.userId });
    if (!deleted) return res.status(404).json({ error: 'Appointment not found or not authorized' });

    console.log(`🗑️ Deleted appointment ${req.params.id} for user ${req.user.userId}`);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting appointment:', err);
    res.status(500).json({ error: 'Server error deleting appointment' });
  }
});

// ─── Important Events Routes ─────────────────────────────
app.get('/api/important-events/month/:month', authenticateToken, async (req, res) => {
  try {
    const events = await ImportantEvent.find({
      userId: req.user.userId,
      date: { $regex: `^${req.params.month}` }
    }).sort({ date: 1 });

    res.json(events);
  } catch (err) {
    console.error('Error fetching events for month:', err);
    res.status(500).json({ error: 'Server error fetching events for month' });
  }
});

app.post('/api/important-events', authenticateToken, async (req, res) => {
  const { title, date } = req.body;
  if (!title || !date) return res.status(400).json({ error: 'Missing fields' });

  try {
    const newEvent = new ImportantEvent({ userId: req.user.userId, title, date });
    await newEvent.save();

    console.log(`✅ Added important event for user ${req.user.userId}: ${title} on ${date}`);
    res.json(newEvent);
  } catch (err) {
    console.error('Error adding important event:', err);
    res.status(500).json({ error: 'Server error adding important event' });
  }
});

app.delete('/api/important-events/:id', authenticateToken, async (req, res) => {
  try {
    const deleted = await ImportantEvent.findOneAndDelete({ _id: req.params.id, userId: req.user.userId });
    if (!deleted) return res.status(404).json({ error: 'Event not found or not authorized' });

    console.log(`🗑️ Deleted important event ${req.params.id} for user ${req.user.userId}`);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting important event:', err);
    res.status(500).json({ error: 'Server error deleting important event' });
  }
});

// ─── Notes & Todos ─────────────────────────────
app.get('/api/note/:date', authenticateToken, async (req, res) => {
  try {
    const note = await Note.findOne({ userId: req.user.userId, date: req.params.date });
    res.json(note ? note.content : '');
  } catch (err) {
    console.error('Error fetching note:', err);
    res.status(500).json({ error: 'Server error fetching note' });
  }
});

app.post('/api/note/:date', authenticateToken, async (req, res) => {
  try {
    const note = await Note.findOneAndUpdate(
      { userId: req.user.userId, date: req.params.date },
      { content: req.body.content },
      { upsert: true, new: true }
    );
    res.json(note);
  } catch (err) {
    console.error('Error saving note:', err);
    res.status(500).json({ error: 'Server error saving note' });
  }
});

app.get('/api/todos/:date', authenticateToken, async (req, res) => {
  try {
    const todo = await Todo.findOne({ userId: req.user.userId, date: req.params.date });
    res.json(todo ? todo.items : []);
  } catch (err) {
    console.error('Error fetching todos:', err);
    res.status(500).json({ error: 'Server error fetching todos' });
  }
});

app.post('/api/todos/:date', authenticateToken, async (req, res) => {
  try {
    const todo = await Todo.findOneAndUpdate(
      { userId: req.user.userId, date: req.params.date },
      { items: req.body.items },
      { upsert: true, new: true }
    );
    res.json(todo);
  } catch (err) {
    console.error('Error saving todos:', err);
    res.status(500).json({ error: 'Server error saving todos' });
  }
});

// ─── 404 Catcher ─────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ─── Serve Frontend in Production ─────────────────────────────
if (process.env.NODE_ENV === 'production') {
  const CLIENT_BUILD_PATH = path.join(__dirname, 'frontend', 'dist');
  app.use(express.static(CLIENT_BUILD_PATH));
  app.get('*', (req, res) => {
    res.sendFile(path.join(CLIENT_BUILD_PATH, 'index.html'));
  });
}

// ─── Start Server ─────────────────────────────
app.listen(PORT, () => {
  console.log(`🌿  Listening on http://localhost:${PORT}`);
});
