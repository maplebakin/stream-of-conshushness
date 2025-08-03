// ─── Load Env ─────────────────────────────
import dotenv from 'dotenv';
dotenv.config();

// ─── Core ─────────────────────────────
import express from 'express';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';

// ─── Middleware & Utils ─────────────────────────────
import auth from './middleware/auth.js';
import authRoutes from './routes/auth.js';

// ─── Route Handlers ─────────────────────────────
import habitRoutes        from './routes/habits.js';
import taskRoutes         from './routes/tasks.js';
import goalRoutes         from './routes/goals.js';
import gameRoutes         from './routes/games.js';
import pageRoutes         from './routes/pages.js';
import sectionPagesRouter from './routes/sectionPages.js';
import sectionRoutes      from './routes/sections.js';     // ⭐ NEW
import entryRoutes        from './routes/entries.js';
import appointmentRoutes  from './routes/appointments.js';
import noteRoutes         from './routes/notes.js';
import importantEventRoutes from './routes/importantEvents.js';
import scheduleRoutes     from './routes/schedule.js';
import calendarRoutes     from './routes/calendar.js';
import rippleRoutes       from './routes/ripples.js';

// ─── GraphQL ─────────────────────────────
import { createHandler } from 'graphql-http/lib/use/express';
import schema from './graphql/schema.js';
import root   from './graphql/resolvers.js';

// ─── App Setup ─────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const app  = express();
const PORT = process.env.PORT || 3000;

// ─── Global Middleware ─────────────────────────────
app.use(express.json());

// ─── REST Routes ─────────────────────────────
app.use('/api',              authRoutes);              // auth/login/register
app.use('/api/habits',       habitRoutes);
app.use('/api/tasks',        taskRoutes);
app.use('/api/goals',        goalRoutes);
app.use('/api/games',        gameRoutes);
app.use('/api/pages',        pageRoutes);
app.use('/api/section-pages', sectionPagesRouter);
app.use('/api/sections',     auth, sectionRoutes);     // ⭐ NEW (protected)
app.use('/api/entries',      auth, entryRoutes);       // protect with token
app.use('/api/appointments', appointmentRoutes);
app.use('/api/note',         noteRoutes);
app.use('/api/important-events', importantEventRoutes);
app.use('/api/schedule',     scheduleRoutes);
app.use('/api/calendar-data', calendarRoutes);
app.use('/api/ripples',      rippleRoutes);

// ─── GraphQL Endpoint ─────────────────────────────
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
      console.warn('Invalid/expired token in GraphQL:', err.message);
      return { user: null };
    }
  }
}));

// ─── Health Check ─────────────────────────────
app.get('/health', (req, res) => res.send('OK'));

// ─── Serve Front-End ─────────────────────────────
const CLIENT_BUILD_PATH = path.join(__dirname, 'frontend', 'dist');
app.use(express.static(CLIENT_BUILD_PATH));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next(); // let the API handle it
  res.sendFile(path.join(CLIENT_BUILD_PATH, 'index.html'));
});

// ─── MongoDB Connection ─────────────────────────────
(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB Atlas');
  } catch (err) {
    console.error('❌ MongoDB connection error:', err);
  }
})();

// ─── Start Server ─────────────────────────────
app.listen(PORT, () => {
  console.log(`🌿 Listening on http://localhost:${PORT}`);
});
