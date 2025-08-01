// ─── Load Env ─────────────────────────────
import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import auth from './middleware/auth.js';
import User from './models/User.js';
import Entry from './models/Entry.js';
import Appointment from './models/Appointment.js';
import ImportantEvent from './models/ImportantEvent.js';
import Note from './models/Note.js';
import Task from './models/Task.js';
import habitRoutes from './routes/habits.js';
import DailySchedule from './models/DailySchedule.js';
import gameRoutes from './routes/games.js';
import pageRoutes from './routes/pages.js';
import sectionPagesRouter from './routes/sectionPages.js';
import SectionPage from './models/SectionPage.js';
import taskRoutes from './routes/tasks.js';
import { createHandler } from 'graphql-http/lib/use/express';
import schema from './graphql/schema.js';
import root from './graphql/resolvers.js';
import Ripple from './models/Ripple.js';
import { extractRipples } from './utils/rippleExtractor.js';
import goalRoutes from './routes/goals.js';

// ─── Paths ─────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const router = express.Router();


// ─── Express App ─────────────────────────────
const app = express();
const PORT = process.env.PORT || 3000;
app.use(express.json());
app.use('/api/games', gameRoutes);
app.use('/api/pages', pageRoutes);
app.use('/api/section-pages', sectionPagesRouter);
app.use('/api/tasks', taskRoutes);
app.use('/api/goals', goalRoutes);
app.use('/api/habits', habitRoutes);

// ─── MongoDB ─────────────────────────────
(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB Atlas');
  } catch (err) {
    console.error('❌ MongoDB connection error:', err);
  }
})();

// ─── Auth Middleware ─────────────────────────────
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
app.use('/graphql', createHandler({
  schema,
  rootValue: root,
  context: (req, res) => {
    // manually extract token and decode
    const authHeader = req.headers['authorization'];
    if (!authHeader) return { user: null };

    const token = authHeader.split(' ')[1];
    if (!token) return { user: null };

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      return { user: decoded };
    } catch (err) {
      console.warn('Invalid or expired token in GraphQL:', err.message);
      return { user: null };
    }
  }
}));

// ─── Health Check ─────────────────────────────
app.get('/health', (req, res) => res.send('OK'));

// ─── User Routes ─────────────────────────────
// Extract ripples from entries in a date range
app.post('/api/ripples/extract', authenticateToken, async (req, res) => {
  try {
    const { startDate, endDate } = req.body;
    
    // Get entries from the date range
    const entries = await Entry.find({
      userId: req.user.userId,
      date: { 
        $gte: startDate, 
        $lte: endDate 
      }
    });

    // Extract potential tasks/appointments from the entries
    const extractedRipples = extractRipples(entries);

    // Save each ripple to the database
    const savedRipples = [];
    for (const rippleData of extractedRipples) {
      const newRipple = new Ripple({
        userId: req.user.userId,
        ...rippleData
      });
      const saved = await newRipple.save();
      savedRipples.push(saved);
    }

    res.json({ 
      message: `Found ${savedRipples.length} potential tasks/appointments`,
      ripples: savedRipples 
    });

  } catch (error) {
    console.error('Error extracting ripples:', error);
    res.status(500).json({ error: 'Server error extracting ripples' });
  }
});
// Get pending ripples for review
app.get('/api/ripples/pending', authenticateToken, async (req, res) => {
  try {
    const ripples = await Ripple.find({
      userId: req.user.userId,
      status: 'pending'
    }).populate('sourceEntryId');
    
    res.json(ripples);
  } catch (error) {
    console.error('Error fetching pending ripples:', error);
    res.status(500).json({ error: 'Server error fetching ripples' });
  }
});
// Approve a ripple and create a task
// Approve a ripple and create a todo
app.put('/api/ripples/:id/approve', authenticateToken, async (req, res) => {
  try {
    const { assignedCluster } = req.body;
    
    // Find the ripple
  const ripple = await Ripple.findOne({
  _id: req.params.id,
  userId: req.user.userId,
  status: 'pending'
}).populate('sourceEntryId'); // ← this part matters!

    
    if (!ripple) {
      return res.status(404).json({ error: 'Ripple not found or already processed' });
    }

    // Create a new todo from the ripple
    const newTask = new Task({
  userId: req.user.userId,
  content: ripple.extractedText,
  completed: false,
  cluster: assignedCluster || null,
  entryId: ripple.sourceEntryId,
});
const savedTask = await newTask.save();

    // Update the ripple status
ripple.status = 'approved';
ripple.createdTaskId = savedTask._id;
ripple.assignedCluster = assignedCluster;
ripple.processedDate = new Date();

// Patch for old ripples
if (!ripple.entryDate && ripple.sourceEntryId?.date) {
  ripple.entryDate = ripple.sourceEntryId.date;
}

await ripple.save();


 res.json({ 
  message: 'Ripple approved and task created',
  ripple,
  task: savedTask 
});

  } catch (error) {
    console.error('Error approving ripple:', error);
    res.status(500).json({ error: 'Server error approving ripple' });
  }
});

// Dismiss a ripple
app.put('/api/ripples/:id/dismiss', authenticateToken, async (req, res) => {
  try {
    const ripple = await Ripple.findOne({
      _id: req.params.id,
      userId: req.user.userId,
      status: 'pending'
    });
    
    if (!ripple) {
      return res.status(404).json({ error: 'Ripple not found or already processed' });
    }

    // Update the ripple status
    ripple.status = 'dismissed';
    ripple.processedDate = new Date();
    await ripple.save();

    res.json({ 
      message: 'Ripple dismissed',
      ripple: ripple 
    });

  } catch (error) {
    console.error('Error dismissing ripple:', error);
    res.status(500).json({ error: 'Server error dismissing ripple' });
  }
});
app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  try {
    const existing = await User.findOne({ username });
    if (existing) return res.status(400).json({ error: 'Username already taken' });
    const passwordHash = await bcrypt.hash(password, 10);
    const newUser = new User({ username, passwordHash });
    await newUser.save();
    res.json({ success: true });
  } catch {
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
    res.json({ success: true, token });
  } catch {
    res.status(500).json({ error: 'Server error during login' });
  }
});

app.get('/api/section-pages', authenticateToken, async (req, res) => {
  try {
    const { section } = req.query;
    const userId = req.user.userId;

    const query = { userId };
    if (section) {
      query.section = new RegExp(`^${section}$`, 'i'); // case-insensitive match
    }

    const pages = await SectionPage.find(query).sort({ createdAt: -1 });
    res.json(pages);
  } catch (err) {
    console.error('Error fetching section pages:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── Calendar Data for Grid ─────────────────────────────
app.get('/api/calendar-data/:month', authenticateToken, async (req, res) => {
  try {
    const month = req.params.month;
    const appointments = await Appointment.find({
      userId: req.user.userId,
      date: { $regex: `^${month}` },
    });

    const calendarData = {};
    if (!calendarData[month]) calendarData[month] = { days: {} };

    appointments.forEach((appt) => {
      if (!calendarData[month].days[appt.date]) {
        calendarData[month].days[appt.date] = { schedule: {} };
      }
      calendarData[month].days[appt.date].schedule[appt.time] = {
        details: appt.details,
        _id: appt._id,
      };
    });

    res.json({ calendarData });
  } catch (err) {
    console.error('Error fetching calendar data:', err);
    res.status(500).json({ error: 'Server error fetching calendar data' });
  }
});

// ─── Appointments ─────────────────────────────
app.get('/api/appointments/:date', authenticateToken, async (req, res) => {
  try {
    const appointments = await Appointment.find({
  userId: req.user.userId,
  date: req.params.date,
}).sort({ time: 1 }).populate('entryId');

    res.json(appointments);
  } catch {
    res.status(500).json({ error: 'Server error fetching appointments' });
  }
});

app.post('/api/appointments', authenticateToken, async (req, res) => {
  let { date, time, details, cluster, entryId } = req.body;
  if (!date || !time || !details) return res.status(400).json({ error: 'Missing fields' });

  try {
    const localDate = new Date(date);
    const year = localDate.getFullYear();
    const month = String(localDate.getMonth() + 1).padStart(2, '0');
    const day = String(localDate.getDate()).padStart(2, '0');
    date = `${year}-${month}-${day}`;
  } catch {
    return res.status(400).json({ error: 'Invalid date format' });
  }

  try {
    const newAppointment = new Appointment({
      userId: req.user.userId,
      date,
      time,
      details,
      cluster: cluster || null,
      entryId: entryId || null,
    });
    await newAppointment.save();
    res.json(newAppointment);
  } catch {
    res.status(500).json({ error: 'Server error adding appointment' });
  }
});



app.delete('/api/appointments/:id', authenticateToken, async (req, res) => {
  try {
    const deleted = await Appointment.findOneAndDelete({
      _id: req.params.id,
      userId: req.user.userId,
    });
    if (!deleted) return res.status(404).json({ error: 'Appointment not found' });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Server error deleting appointment' });
  }
});
app.get('/api/appointments/cluster/:cluster', authenticateToken, async (req, res) => {
  try {
    const appointments = await Appointment.find({
      userId: req.user.userId,
      cluster: req.params.cluster
    }).sort({ date: 1, time: 1 }).populate('entryId');
    res.json(appointments);
  } catch {
    res.status(500).json({ error: 'Server error fetching appointments by cluster' });
  }
});


// ─── Important Events ─────────────────────────────
app.get('/api/important-events/:month', authenticateToken, async (req, res) => {
  try {
   const events = await ImportantEvent.find({
  userId: req.user.userId,
  date: { $regex: `^${req.params.month}` },
}).populate('entryId');
    res.json(events);
  } catch {
    res.status(500).json({ error: 'Server error fetching important events' });
  }
});

app.post('/api/important-events', authenticateToken, async (req, res) => {
  const { title, date, cluster, entryId } = req.body;
  if (!title || !date) return res.status(400).json({ error: 'Missing fields' });

  try {
    const newEvent = new ImportantEvent({
      userId: req.user.userId,
      title,
      date,
      cluster: cluster || null,
      entryId: entryId || null,
    });
    await newEvent.save();
    res.json(newEvent);
  } catch {
    res.status(500).json({ error: 'Server error adding important event' });
  }
});


app.delete('/api/important-events/:id', authenticateToken, async (req, res) => {
  try {
    const deleted = await ImportantEvent.findOneAndDelete({
      _id: req.params.id,
      userId: req.user.userId,
    });
    if (!deleted) return res.status(404).json({ error: 'Event not found' });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Server error deleting event' });
  }
});
app.get('/api/important-events/cluster/:cluster', authenticateToken, async (req, res) => {
  try {
    const events = await ImportantEvent.find({
      userId: req.user.userId,
      cluster: req.params.cluster
    }).sort({ date: 1 }).populate('entryId');
    res.json(events);
  } catch {
    res.status(500).json({ error: 'Server error fetching events by cluster' });
  }
});

// ─── Notes ─────────────────────────────
app.get('/api/note/:date', authenticateToken, async (req, res) => {
  try {
    const note = await Note.findOne({ userId: req.user.userId, date: req.params.date }).populate('entryId');
    res.json(note || null);
  } catch {
    res.status(500).json({ error: 'Server error fetching note' });
  }
});


app.post('/api/note/:date', authenticateToken, async (req, res) => {
  const { content, cluster, entryId } = req.body;
  try {
    const note = await Note.findOneAndUpdate(
      { userId: req.user.userId, date: req.params.date },
      {
        content,
        cluster: cluster || null,
        entryId: entryId || null,
      },
      { upsert: true, new: true }
    ).populate('entryId');

    res.json(note);
  } catch {
    res.status(500).json({ error: 'Server error saving note' });
  }
});




// ─── Daily Schedule ─────────────────────────────
app.get('/api/schedule/:date', authenticateToken, async (req, res) => {
  try {
    const scheduleItems = await DailySchedule.find({ userId: req.user.userId, date: req.params.date }).sort({ hour: 1 });
    res.json(scheduleItems);
  } catch {
    res.status(500).json({ error: 'Server error fetching daily schedule' });
  }
});

app.post('/api/schedule', authenticateToken, async (req, res) => {
  const { date, hour, text } = req.body;
  if (!date || !hour) {
    return res.status(400).json({ error: 'Missing date or hour' });
  }
  try {
    const updated = await DailySchedule.findOneAndUpdate(
      { userId: req.user.userId, date, hour },
      { text },
      { upsert: true, new: true }
    );
    res.json(updated);
  } catch {
    res.status(500).json({ error: 'Server error saving daily schedule' });
  }
});

// Get entries for a specific day
app.get('/api/entries/:date', authenticateToken, async (req, res) => {
  try {
    const entries = await Entry.find({
      userId: req.user.userId,
      date: req.params.date,
    });
    res.json(entries);
  } catch {
    res.status(500).json({ error: 'Server error fetching entries' });
  }
});


// Add a new entry + extract ripples
app.post('/api/entries', authenticateToken, async (req, res) => {
  const { date, section, tags, content } = req.body;
  if (!date || !section || !content) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const newEntry = new Entry({
      userId: req.user.userId,
      date,
      section,
      tags: tags || [],
      content,
    });

    await newEntry.save();

    // 🧠 Run ripple extraction
    const extracted = extractRipples([newEntry]);
    const savedRipples = [];

    for (const r of extracted) {
      const ripple = new Ripple({
        userId: req.user.userId,
        sourceEntryId: newEntry._id,
        ...r
      });
      savedRipples.push(await ripple.save());
    }

    res.json({ entry: newEntry, ripples: savedRipples });
  } catch (err) {
    console.error('Error saving entry or extracting ripples:', err);
    res.status(500).json({ error: 'Server error saving entry or ripples' });
  }
});


// Update an existing entry
app.put('/api/entries/:id', authenticateToken, async (req, res) => {
  const { date, section, tags, content } = req.body;
  if (!date || !section || !content) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  try {
    const updateData = {
      date,
      section,
      tags: Array.isArray(tags) ? tags : tags || [],
      content,
    };
    const updated = await Entry.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.userId },
      updateData,
      { new: true }
    );
    if (!updated) return res.status(404).json({ error: 'Entry not found' });
    res.json(updated);
  } catch {
    res.status(500).json({ error: 'Server error updating entry' });
  }
});

// Delete an entry
app.delete('/api/entries/:id', authenticateToken, async (req, res) => {
  try {
    const deleted = await Entry.findOneAndDelete({
      _id: req.params.id,
      userId: req.user.userId,
    });
    if (!deleted) return res.status(404).json({ error: 'Entry not found' });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Server error deleting entry' });
  }
});

app.get('/api/entries', authenticateToken, async (req, res) => {
  const { section } = req.query;
  const query = { userId: req.user.userId };

  if (section) {
    query.section = new RegExp(`^${section}$`, 'i'); // Case-insensitive
  }

  try {
    const entries = await Entry.find(query).sort({ date: -1 });
    res.json(entries);
  } catch (err) {
    console.error('Failed to get entries:', err);
    res.status(500).json({ error: 'Failed to fetch entries' });
  }
});




app.post('/api/pages', authenticateToken, async (req, res) => {
  const { section, slug, title, content } = req.body;
  try {
    const newPage = new SectionPage({
      section,
      slug,
      title,
      content,
      userId: req.user.userId,
    });
    await newPage.save();
    res.json(newPage);
  } catch (err) {
    console.error('❌ Error creating section page:', err);
    res.status(500).json({ message: 'Server error creating page' });
  }
});

// PUT /api/sections/rename


app.put('/api/sections/rename', authenticateToken, async (req, res) => {
  const { oldName, newName } = req.body;
  if (!oldName || !newName) {
    return res.status(400).json({ error: 'Missing section names' });
  }

  try {
    const result = await Entry.updateMany(
      { userId: req.user._id, section: oldName },
      { $set: { section: newName } }
    );
    res.json({ message: 'Section reassigned', updated: result.modifiedCount });
  } catch (err) {
    console.error('⚠️ Failed to reassign section:', err);
    res.status(500).json({ error: 'Server error while reassigning section' });
  }
});

app.delete('/api/sections/:sectionName', authenticateToken, async (req, res) => {
  const sectionName = decodeURIComponent(req.params.sectionName);
  if (!sectionName) return res.status(400).json({ error: 'Missing section name' });

  try {
    const result = await Entry.deleteMany({ userId: req.user._id, section: sectionName });
    res.json({ message: 'Section deleted', deleted: result.deletedCount });
  } catch (err) {
    console.error('Section delete failed:', err);
    res.status(500).json({ error: 'Failed to delete section' });
  }
});
// Get list of unique sections for the user
app.get('/api/sections', authenticateToken, async (req, res) => {
  try {
    const entries = await Entry.find({ userId: req.user.userId });
    const uniqueSections = [...new Set(entries.map((e) => e.section))].filter(Boolean).sort();
    res.json(uniqueSections);
  } catch (err) {
    console.error('⚠️ Failed to get sections:', err);
    res.status(500).json({ error: 'Server error fetching sections' });
  }
});


// ─── Serve Frontend ─────────────────────────────
const CLIENT_BUILD_PATH = path.join(__dirname, 'frontend', 'dist');
app.use(express.static(CLIENT_BUILD_PATH));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(CLIENT_BUILD_PATH, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🌿  Listening on http://localhost:${PORT}`);
});
