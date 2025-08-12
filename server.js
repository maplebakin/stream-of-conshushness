// ─── Load Env ─────────────────────────────
import dotenv from 'dotenv';
dotenv.config();

/* ───────────── Core ───────────── */
import express            from 'express';
import path, { dirname }  from 'path';
import { fileURLToPath }  from 'url';
import mongoose           from 'mongoose';
import jwt                from 'jsonwebtoken';

/* ───────────── Utils & Middleware ───────────── */
import cors     from 'cors';
import helmet   from 'helmet';
import auth     from './middleware/auth.js';
import authRoutes from './routes/auth.js';

/* ───────────── Route Handlers ───────────── */
import habitRoutes          from './routes/habits.js';
import taskRoutes           from './routes/tasks.js';
import goalRoutes           from './routes/goals.js';
import gameRoutes           from './routes/games.js';
import pageRoutes           from './routes/pages.js';
import sectionPagesRouter   from './routes/sectionPages.js';
import sectionRoutes        from './routes/sections.js';
import entryRoutes          from './routes/entries.js';
import appointmentsRouter   from './routes/appointments.js'; // ✅ name matches below
import noteRoutes           from './routes/notes.js';
import eventsRouter         from './routes/events.js';       // ✅ name matches below
import scheduleRoutes       from './routes/schedule.js';
import calendarRoutes       from './routes/calendar.js';
import rippleRoutes         from './routes/ripples.js';
import suggestedTaskRoutes  from './routes/suggestedTasks.js';
import clusterRoutes        from './routes/clusters.js';
import uploadRouter         from './utils/upload.js';

/* ───────────── GraphQL ───────────── */
import { createHandler } from 'graphql-http/lib/use/express';
import schema from './graphql/schema.js';
import root   from './graphql/resolvers.js';

/* ───────────── App Setup ───────────── */
const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const app  = express();
const PORT = process.env.PORT || 3000;

/* ───────────── Global Middleware ───────────── */
app.use(cors());
app.use(helmet());
app.use(express.json());


/* ───────────── REST Routes ───────────── */
app.use('/api',                 authRoutes);                 // login / register

app.use('/api/habits',          auth, habitRoutes);
app.use('/api/tasks',           auth, taskRoutes);
app.use('/api/goals',           auth, goalRoutes);
app.use('/api/games',           auth, gameRoutes);
app.use('/api/pages',           auth, pageRoutes);
app.use('/api/section-pages',   auth, sectionPagesRouter);
app.use('/api/sections',        auth, sectionRoutes);
app.use('/api/entries',         auth, entryRoutes);
app.use('/api/appointments',    auth, appointmentsRouter);   // ✅ fixed
app.use('/api/notes',           auth, noteRoutes);
app.use('/api/events',          auth, eventsRouter);         // ✅ fixed
app.use('/api/schedule',        auth, scheduleRoutes);
app.use('/api/calendar-data',   auth, calendarRoutes);
app.use('/api/ripples',         auth, rippleRoutes);
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));
app.use('/api/suggested-tasks', auth, suggestedTaskRoutes);
app.use('/api/clusters',        auth, clusterRoutes);
app.use('/api/upload',          auth, uploadRouter); 

/* ───────────── GraphQL Endpoint ───────────── */
app.use('/graphql', createHandler({
  schema,
  rootValue: root,
  context: (req) => {
    const authHeader = req.headers['authorization'] || '';
    const token      = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      return { user: decoded };
    } catch {
      return { user: null };
    }
  }
}));

/* ───────────── Health Check ───────────── */
app.get('/health', (_, res) => res.send('OK'));

/* ───────────── Serve Front-End ───────────── */
const CLIENT_BUILD_PATH = path.join(__dirname, 'frontend', 'dist');
app.use(express.static(CLIENT_BUILD_PATH));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/graphql')) return next();
  res.sendFile(path.join(CLIENT_BUILD_PATH, 'index.html'));
});

/* ───────────── MongoDB Connection ───────────── */
(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB Atlas');
  } catch (err) {
    console.error('❌ MongoDB connection error:', err);
  }
})();

/* ───────────── Start Server ───────────── */
app.listen(PORT, () => {
  console.log(`🌿 Listening on http://localhost:${PORT}`);
});
