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
import { globalErrorHandler } from "./utils/errorHandler.js";

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

import ripplesRouter from "./routes/ripples.js";
import suggestedTaskRoutes from "./routes/suggestedTasks.js";
import clustersRouter from "./routes/clusters.js";
import uploadRouter from "./utils/upload.js";
import adminRoutes from "./routes/admin.js";
import exportRoutes from "./routes/export.js";
import searchRoutes from "./routes/search.js";
import researchRoutes from "./routes/research.js";
import Ripple from "./models/Ripple.js";

/* ───────────── Compat (ESM) ───────────── */
import compatRouter from "./routes/compat.js";



/* ───────────── App Setup ───────────── */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.set("trust proxy", true);
app.disable("x-powered-by");

// Mount compat router under /routes to avoid conflicts with main API
app.use('/routes', compatRouter);

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
  })
);

app.use(express.json({ limit: "5mb" }));

/* ───────────── Rate Limiting ───────────── */
app.use(generalLimiter); // Apply general rate limiting to all routes
app.use(writeLimiter);   // Additional limit on write operations

// ── Legacy note-by-date shim (quiet 200 on "no note yet") ───────────
import Note from './models/Note.js'; // put at top with other imports if not already

app.get('/api/note/:date(\\d{4}-\\d{2}-\\d{2})', auth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const date = req.params.date;
    const item = await Note.findOne({ userId, date }).lean();
    return res.json({ ok: true, item: item || null, content: item?.content || '' });
  } catch (e) {
    console.error('[note-by-date shim] failed:', e);
    return res.status(500).json({ error: 'note lookup failed', detail: e.message });
  }
});

app.get('/api/note', auth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const date = (req.query?.date || '').toString().trim();
    if (!date) return res.json({ ok: true, item: null, content: '' });
    const item = await Note.findOne({ userId, date }).lean();
    return res.json({ ok: true, item: item || null, content: item?.content || '' });
  } catch (e) {
    console.error('[note-by-query shim] failed:', e);
    return res.status(500).json({ error: 'note lookup failed', detail: e.message });
  }
});


/* ───────────── Health Check ───────────── */
app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    env: process.env.NODE_ENV || "development",
    mongo: !!mongoose.connection.readyState,
  });
});

/* ───────────── Static: uploads ───────────── */
app.use(
  "/uploads",
  express.static(path.join(__dirname, "uploads"), {
    setHeaders: (res, filePath) => {
      res.setHeader("X-Content-Type-Options", "nosniff");
      if (/\.(pdf|txt|md)$/i.test(filePath)) {
        res.setHeader("Content-Disposition", "attachment");
      }
    },
  })
);


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


/**
 * Ripples router defines its own sub-paths (e.g. /ripples, /ripples/analyze).
 * Mounted at /api so they resolve to /api/ripples, /api/ripples/analyze, etc.
 */
app.use("/api", auth, ripplesRouter);

/** Other feature routers */
app.use("/api/suggested-tasks", auth, suggestedTaskRoutes);
app.use("/api/clusters", auth, clustersRouter);
app.use("/api/upload", auth, uploadRouter);
app.use("/api/admin", auth, adminRoutes);
app.use("/api/export", auth, exportRoutes);
app.use("/api/search", auth, searchRoutes);
app.use("/api/research", auth, researchRoutes);


// ── Dev route inspector (shows full mount paths, supports arrays) ─────────────
if (process.env.NODE_ENV !== "production") {
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
    console.error("alias /api/ripples/:date failed", e);
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
if (process.env.NODE_ENV !== "test") {
  (async () => {
    try {
      await mongoose.connect(process.env.MONGODB_URI);
      console.log("✅ Connected to MongoDB");
    } catch (err) {
      console.error("❌ MongoDB connection error:", err);
    }
  })();

  /* ───────────── Start Server ───────────── */
  app.listen(PORT, () => {
    console.log(`🌿 Listening on http://localhost:${PORT}`);
  });
}
