// ─── Load Env ─────────────────────────────
import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

// ─── Utilities & Middleware ─────────────────────────────
import { analyzeEntry } from './utils/analyzeEntry.js';
import { extractRipples } from './utils/rippleExtractor.js';
import auth from './middleware/auth.js';
import authRoutes from './routes/auth.js';

// ─── Models ─────────────────────────────
import User from './models/User.js';
import Entry from './models/Entry.js';
import Appointment from './models/Appointment.js';
import ImportantEvent from './models/ImportantEvent.js';
import Note from './models/Note.js';
import Task from './models/Task.js';
import Ripple from './models/Ripple.js';
import DailySchedule from './models/DailySchedule.js';
import SectionPage from './models/SectionPage.js';
import entryRoutes from './routes/entries.js';
import scheduleRoutes from './routes/schedule.js';

// ─── Routes ─────────────────────────────
import habitRoutes from './routes/habits.js';
import taskRoutes from './routes/tasks.js';
import goalRoutes from './routes/goals.js';
import gameRoutes from './routes/games.js';
import pageRoutes from './routes/pages.js';
import sectionPagesRouter from './routes/sectionPages.js';
import appointmentRoutes from './routes/appointments.js';
import noteRoutes from './routes/notes.js';
import todoRoutes from './routes/todos.js';
import importantEventRoutes from './routes/importantEvents.js';
import calendarRoutes from './routes/calendar.js';

// ─── GraphQL ─────────────────────────────
import { createHandler } from 'graphql-http/lib/use/express';
import schema from './graphql/schema.js';
import root from './graphql/resolvers.js';

// ─── Paths & App Setup ─────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ─────────────────────────────
app.use(express.json());
app.use('/api/games', gameRoutes);
app.use('/api/pages', pageRoutes);
app.use('/api/section-pages', sectionPagesRouter);
app.use('/api/tasks', taskRoutes);
app.use('/api/goals', goalRoutes);
app.use('/api/habits', habitRoutes);
app.use('/api', authRoutes);
app.use('/api/entries', auth, entryRoutes); // protect it with token
app.use('/api/appointments', appointmentRoutes);
app.use('/api/schedule', scheduleRoutes);
app.use('/api/note', noteRoutes);
app.use('/api/todos', todoRoutes);
app.use('/api/important-events', importantEventRoutes);
app.use('/api/calendar-data', calendarRoutes);

// ─── MongoDB Connection ─────────────────────────────
(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB Atlas');
  } catch (err) {
    console.error('❌ MongoDB connection error:', err);
  }
})();

// ─── Auth Middleware for GraphQL ─────────────────────────────
app.use('/graphql', createHandler({
  schema,
  rootValue: root,
  context: (req) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return { user: null };
    const token = authHeader.split(' ')[1];
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

// ─── Static Frontend ─────────────────────────────
const CLIENT_BUILD_PATH = path.join(__dirname, 'frontend', 'dist');
app.use(express.static(CLIENT_BUILD_PATH));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(CLIENT_BUILD_PATH, 'index.html'));
});

// ─── Start Server ─────────────────────────────
app.listen(PORT, () => {
  console.log(`🌿 Listening on http://localhost:${PORT}`);
});
