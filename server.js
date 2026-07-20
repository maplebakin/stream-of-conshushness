// ─── Load Env ─────────────────────────────
import dotenv from "dotenv";
dotenv.config();

/* ───────────── Core ───────────── */
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import mongoose from "mongoose";

/* ───────────── Utils & Middleware ───────────── */
import cors from "cors";
import helmet from "helmet";
import auth from "./middleware/auth.js";
import { generalLimiter, writeLimiter } from "./middleware/rateLimiter.js";
import { globalErrorHandler, logSafeError } from "./utils/errorHandler.js";
import { parseTrustedProxyHops } from "./utils/trustProxy.js";
import { assertRuntimeConfig } from "./utils/runtimeConfig.js";
import { closeServerAndDatabase } from "./utils/serverLifecycle.js";
import { ensurePrivateUploadDir } from "./utils/privateUploadStorage.js";
import { initializeDeclaredIndexes } from "./utils/integrityIndexes.js";

/* ───────────── Route Handlers (ESM) ───────────── */
import authRoutes from "./routes/auth.js";
import habitRoutes from "./routes/habits.js";
import taskRoutes from "./routes/tasks.js";
import goalRoutes from "./routes/goals.js";
import gameRoutes from "./routes/games.js";

import sectionRoutes from "./routes/sections.js";
import sectionPagesRouter from "./routes/sectionPages.js";
import entryRoutes from "./routes/entries.js";
import appointmentsRouter from "./routes/appointments.js";
import noteRoutes from "./routes/notes.js";           // ✅ keep plural, single mount
import eventsRouter from "./routes/events.js";
import scheduleRouter from "./routes/schedule.js";
import calendarRoutes from "./routes/calendar.js";     // ✅ keep this one
import horizonRoutes from "./routes/horizon.js";

import ripplesRouter from "./routes/ripples.js";
import suggestedTaskRoutes from "./routes/suggestedTasks.js";
import gatherItemRoutes from "./routes/gatherItems.js";
import suggestedGatherItemRoutes from "./routes/suggestedGatherItems.js";
import interestRoutes from "./routes/interests.js";
import suggestedInterestRoutes from "./routes/suggestedInterests.js";
import clustersRouter from "./routes/clusters.js";
import uploadRouter from "./utils/upload.js";
import adminRoutes from "./routes/admin.js";
import exportRoutes from "./routes/export.js";
import searchRoutes from "./routes/search.js";
import researchRoutes from "./routes/research.js";
import reviewRoutes from "./routes/review.js";
import suggestedScheduleRoutes from "./routes/suggestedSchedules.js";
import Ripple from "./models/Ripple.js";

/* ───────────── Compat (ESM) ───────────── */
import compatRouter from "./routes/compat.js";



/* ───────────── App Setup ───────────── */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || "development";

// Fail before listening or accepting account/data writes when production
// privacy, authentication, or persistence settings are incomplete.
assertRuntimeConfig({ ...process.env, NODE_ENV });
if (NODE_ENV === 'production') ensurePrivateUploadDir();

app.set("trust proxy", parseTrustedProxyHops(process.env.TRUST_PROXY_HOPS));
app.disable("x-powered-by");

/* ───────────── Global Middleware ───────────── */
app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
    credentials: false, // using Authorization header, not cookies
  })
);

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: {
      directives: {
        imgSrc: ["'self'", 'data:', 'blob:'],
      },
    },
  })
);

app.use(express.json({ limit: "5mb" }));

/* ───────────── Rate Limiting ───────────── */
app.use(generalLimiter); // Apply general rate limiting to all routes
app.use(writeLimiter);   // Additional limit on write operations

// Mount compat router under /routes after shared security middleware.
app.use('/routes', compatRouter);

// ── Legacy note-by-date shim (quiet 200 on "no note yet") ───────────
import Note from './models/Note.js'; // put at top with other imports if not already

function unclusteredDateNoteQuery(userId, date) {
  return {
    userId,
    date,
    $and: [
      { $or: [{ cluster: '' }, { cluster: null }, { cluster: { $exists: false } }] },
      { $or: [{ clusters: { $size: 0 } }, { clusters: { $exists: false } }] },
    ],
  };
}

app.get('/api/note/:date(\\d{4}-\\d{2}-\\d{2})', auth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const date = req.params.date;
    const item = await Note.findOne(unclusteredDateNoteQuery(userId, date)).lean();
    return res.json({ ok: true, item: item || null, content: item?.content || '' });
  } catch (e) {
    logSafeError('note by date shim failed', e);
    return res.status(500).json({ error: 'note lookup failed' });
  }
});

app.get('/api/note', auth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const date = (req.query?.date || '').toString().trim();
    if (!date) return res.json({ ok: true, item: null, content: '' });
    const item = await Note.findOne(unclusteredDateNoteQuery(userId, date)).lean();
    return res.json({ ok: true, item: item || null, content: item?.content || '' });
  } catch (e) {
    logSafeError('note by query shim failed', e);
    return res.status(500).json({ error: 'note lookup failed' });
  }
});


/* ───────────── Health Check ───────────── */
function getMongoHealth() {
  return { mongoReady: mongoose.connection.readyState === 1 };
}

app.get("/health", (_req, res) => {
  const health = getMongoHealth();
  res.status(health.mongoReady ? 200 : 503).json({
    ok: health.mongoReady,
    ...health,
  });
});

app.get('/health/live', (_req, res) => {
  res.json({ ok: true });
});

/* ───────────── REST Routes ───────────── */
/**
 * Auth routes are mounted twice intentionally:
 *   /api        → canonical paths: POST /api/login, POST /api/register, GET /api/me …
 *   /api/auth   → aliased paths:   POST /api/auth/login, POST /api/auth/register …
 * Both are kept for backwards compatibility with existing clients.
 */
app.use("/api", authRoutes);
app.use("/api/auth", authRoutes);

/** Protected APIs */
app.use("/api/habits", auth, habitRoutes);
app.use("/api/tasks", auth, taskRoutes);
app.use("/api/goals", auth, goalRoutes);
app.use("/api/games", auth, gameRoutes);

app.use("/api/sections", auth, sectionRoutes);
app.use("/api/section-pages", auth, sectionPagesRouter);
app.use("/api/entries", auth, entryRoutes);
app.use("/api/appointments", auth, appointmentsRouter);

// notes — keep plural AND add singular alias used by the FE
app.use("/api/notes", auth, noteRoutes);
app.use("/api/note", auth, noteRoutes);
app.use("/api/important-events", auth, eventsRouter);
app.use("/api/events", auth, eventsRouter);
app.use("/api/schedule", auth, scheduleRouter);
app.use("/api/calendar", auth, calendarRoutes);
app.use("/api/horizon", auth, horizonRoutes);


/**
 * Ripples router defines its own sub-paths (e.g. /ripples, /ripples/analyze).
 * Mounted at /api so they resolve to /api/ripples, /api/ripples/analyze, etc.
 */
app.use("/api", auth, ripplesRouter);

/** Other feature routers */
app.use("/api/suggested-tasks", auth, suggestedTaskRoutes);
app.use("/api/gather-items", auth, gatherItemRoutes);
app.use("/api/suggested-gather-items", auth, suggestedGatherItemRoutes);
app.use("/api/interests", auth, interestRoutes);
app.use("/api/suggested-interests", auth, suggestedInterestRoutes);
app.use("/api/suggested-schedules", auth, suggestedScheduleRoutes);
app.use("/api/clusters", auth, clustersRouter);
app.use("/api/upload", auth, uploadRouter);
app.use("/api/admin", auth, adminRoutes);
app.use("/api/export", auth, exportRoutes);
app.use("/api/search", auth, searchRoutes);
app.use("/api/research", auth, researchRoutes);
app.use("/api/review", auth, reviewRoutes);


// ── Opt-in local route inspector (shows full mount paths) ──────────────
// Do not expose the internal route inventory merely because a server was
// started without NODE_ENV=production (for example on a shared LAN).
if (
  process.env.NODE_ENV !== "production"
  && process.env.EXPOSE_ROUTE_INSPECTOR === "true"
) {
  const patternToPrefix = (layer) => {
    if (!layer?.regexp || layer.regexp.fast_slash) return "";
    const src = String(layer.regexp); // "/^\\/api\\/entries\\/?(?=\\/|$)/i"
    const m = src.match(/^\/\^\\\/(.*?)\\\/\?\(\?=\\\/\|\$\)\/i$/)
           || src.match(/^\/\^\\\/(.*?)\\\/\?\/i$/)
           || src.match(/^\/\^\\\/(.*?)\\\/.*\/i$/)
           || src.match(/^\/\^\\\/(.*?)\\\/\?\$\/i$/);
    return m ? ("/" + m[1].replace(/\\\//g, "/")) : "";
  };
  const normalize = (p) => Array.isArray(p) ? p : (typeof p === "string" ? [p] : []);

  app.get("/__routes_full", (_req, res) => {
    const out = [];
    const walk = (stack, base = "") => {
      (stack || []).forEach((layer) => {
        if (layer.route && layer.route.path) {
          const methods = Object.keys(layer.route.methods || {}).map((m) => m.toUpperCase());
          normalize(layer.route.path).forEach((p) => out.push({ path: base + p, methods }));
        } else if (layer.name === "router" && layer.handle?.stack) {
          walk(layer.handle.stack, base + patternToPrefix(layer));
        }
      });
    };
    walk(app._router?.stack || [], "");
    out.sort((a, b) => a.path.localeCompare(b.path));
    res.json(out);
  });
}

// ── Compat alias: /api/ripples/:date → /api/ripples?date=YYYY-MM-DD ───────────
app.get("/api/ripples/:date(\\d{4}-\\d{2}-\\d{2})", auth, async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id || req.user?._id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { date } = req.params;
    const { cluster, status } = req.query; // we ignore scan=1; harmless to pass through

    const q = { userId, dateKey: date };
    if (cluster) q.section = String(cluster);
    if (status)  q.status  = String(status);

    const rows = await Ripple.find(q).sort({ createdAt: 1 }).lean();
    res.json(rows);
  } catch (e) {
    logSafeError('ripples date alias failed', e);
    res.status(500).json({ error: "Server error" });
  }
});


/* ───────────── API 404 Guard (JSON, never SPA) ───────────── */
app.use("/api/*", (_req, res) => {
  res.status(404).json({ error: "Not found" });
});

/* ───────────── Serve Front-End ───────────── */
const CLIENT_BUILD_PATH = path.join(__dirname, "frontend", "dist");
const hasDist = fs.existsSync(path.join(CLIENT_BUILD_PATH, "index.html"));
if (hasDist) {
  app.use(express.static(CLIENT_BUILD_PATH));
  app.get("*", (req, res, next) => {
    if (
      req.path.startsWith("/api") ||
      req.path.startsWith("/uploads")
    ) return next();
    res.sendFile(path.join(CLIENT_BUILD_PATH, "index.html"));
  });
} else {
  // dev-friendly landing
  app.get("/", (_req, res) => {
    res
      .status(200)
      .type("html")
      .send(`<!doctype html><meta charset="utf-8"><body style="font-family:system-ui;padding:2rem">
        <h1>Stream API is running</h1>
        <p>Run Vite at <code>http://localhost:5173</code> or build the frontend to serve it here.</p>
        <ul>
          <li><a href="/health">/health</a></li>
          <li><code>POST /api/login</code> (also available at <code>/api/auth/login</code>)</li>
          <li><code>GET /api/ripples?date=YYYY-MM-DD</code></li>
        </ul>
      </body>`);
  });
}

/* ───────────── Error Handling ───────────── */
app.use(globalErrorHandler);

export default app;

/* ───────────── MongoDB Connection ───────────── */
if (NODE_ENV !== "test") {
  let httpServer = null;
  let shutdownStarted = false;

  const startListening = () => {
    httpServer = app.listen(PORT, () => {
      console.log(`🌿 Listening on http://localhost:${PORT}`);
    });
  };

  const shutDown = async (signal) => {
    if (shutdownStarted) {
      httpServer?.closeAllConnections?.();
      process.exit(1);
      return;
    }
    shutdownStarted = true;
    console.log(`Received ${signal}; finishing active requests before shutdown.`);

    const forceTimer = setTimeout(() => {
      httpServer?.closeAllConnections?.();
      process.exit(1);
    }, 10_000);
    forceTimer.unref();

    try {
      await closeServerAndDatabase({
        server: httpServer,
        disconnect: () => mongoose.disconnect(),
      });
      clearTimeout(forceTimer);
      process.exitCode = 0;
    } catch (error) {
      clearTimeout(forceTimer);
      logSafeError('Graceful shutdown failed', error);
      process.exitCode = 1;
    }
  };

  process.once('SIGTERM', () => void shutDown('SIGTERM'));
  process.once('SIGINT', () => void shutDown('SIGINT'));

  (async () => {
    try {
      if (NODE_ENV === "production") {
        await mongoose.connect(process.env.MONGODB_URI);
        await initializeDeclaredIndexes(mongoose);
        console.log("✅ Connected to MongoDB");
        startListening();
        return;
      }

      startListening();
      mongoose.connect(process.env.MONGODB_URI)
        .then(() => console.log("✅ Connected to MongoDB"))
        .catch((err) => {
          logSafeError('MongoDB connection failed', err);
        });
    } catch (err) {
      logSafeError('MongoDB connection failed', err);
      if (NODE_ENV === "production") {
        process.exit(1);
      }
      if (!httpServer) startListening();
    }
  })();
}
