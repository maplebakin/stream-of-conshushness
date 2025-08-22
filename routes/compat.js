// routes/compat.js (ESM)
// Mount at /api (AFTER all real /api/* routers)
import express from "express";
import path from "path";
import fs from "fs";
import multer from "multer";
import auth from "../middleware/auth.js";

const router = express.Router();

/* -------------------------
   Ensure uploads/ exists (for other parts of the app)
   ------------------------- */
const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

/* -------------------------
   1) True FLAT AUTH aliases at /api/*
   Forwards /api/<path> -> /api/auth/<path>
   ------------------------- */
const { default: authRouter } = await import("./auth.js");
const flatAuthPaths = [
  "/login",
  "/register",
  "/me",
  "/forgot",
  "/reset",
  "/change-password",
  "/email/start-verify",
  "/email/verify",
];
for (const p of flatAuthPaths) {
  router.use(p, (req, res, next) => {
    req.url = `/auth${req.url}`; // e.g., /login -> /auth/login
    authRouter(req, res, next);
  });
}

/* -------------------------
   2) Hyphen vs camelCase (AUTH)
      /suggested-tasks -> /suggestedTasks
   ------------------------- */
try {
  const { default: suggestedTasksRouter } = await import("./suggestedTasks.js");
  router.use("/suggested-tasks", auth, suggestedTasksRouter);
} catch (e) {
  console.warn("[compat] suggestedTasks router not found:", e.message);
}

/* -------------------------
   3) Pages naming variants (AUTH)
      /pages and /section-pages -> sectionPages
   ------------------------- */
try {
  const { default: sectionPagesRouter } = await import("./sectionPages.js");
  router.use("/pages", auth, sectionPagesRouter);
  router.use("/section-pages", auth, sectionPagesRouter);
} catch (e) {
  console.warn("[compat] sectionPages router not found:", e.message);
}

/* -------------------------
   4) Notes singular alias (AUTH)
      /note -> /notes
   ------------------------- */
try {
  const { default: notesRouter } = await import("./notes.js");
  router.use("/note", auth, notesRouter);
} catch (e) {
  console.warn("[compat] notes router not found:", e.message);
}

/* -------------------------
   5) Ripples forwarder (AUTH, robust)
      Ensure /api/ripples/:whatever works even if the inner router
      defines its own '/ripples/...' paths.
   ------------------------- */
try {
  const { default: ripplesRouter } = await import("./ripples.js");
  router.use("/ripples", auth, (req, res, next) => {
    const rest = req.url;            // '/2025-08-21' or '/<id>/approve'
    req.url = `/ripples${rest}`;     // '/ripples/2025-08-21'
    ripplesRouter(req, res, next);
  });
} catch (e) {
  console.warn("[compat] ripples router not found:", e.message);
}

/* -------------------------
   6) Schedule base (AUTH)
      /api/schedule?date=YYYY-MM-DD -> /api/schedule/:date
   ------------------------- */
router.get("/schedule", auth, (req, res) => {
  const tz = "America/Toronto";
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
  const date = (req.query.date || today).trim();
  res.redirect(307, `/api/schedule/${date}`);
});

/* -------------------------
   7) Tasks link/unlink (AUTH) — REAL implementation
      POST /api/tasks/:id/link-entry
        Body options:
          { entryId: "<Entry._id>" }
          OR { date: "YYYY-MM-DD", autoCreate?: boolean, title?, content? }
        - If date provided and no entry exists:
            - If autoCreate === true → create Entry for that date (with optional title/content)
            - Else → 404
      POST /api/tasks/:id/unlink-entry
   ------------------------- */
import mongoose from "mongoose";
const { default: Task } = await import("../models/Task.js");
const { default: Entry } = await import("../models/Entry.js");

function isObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

router.post("/tasks/:id/link-entry", auth, async (req, res) => {
  try {
    const taskId = req.params.id;
    if (!isObjectId(taskId)) return res.status(400).json({ error: "Invalid task id" });

    const task = await Task.findById(taskId);
    if (!task) return res.status(404).json({ error: "Task not found" });
    // Ensure ownership (if your auth middleware sets req.user)
    if (task.userId && req.user?.id && String(task.userId) !== String(req.user.id)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const { entryId, date, autoCreate = false, title = "", content = "" } = req.body || {};
    let entry = null;

    if (entryId) {
      if (!isObjectId(entryId)) return res.status(400).json({ error: "Invalid entryId" });
      entry = await Entry.findById(entryId);
      if (!entry) return res.status(404).json({ error: "Entry not found" });
    } else if (date) {
      entry = await Entry.findOne({ date });
      if (!entry && autoCreate) {
        // Create minimal entry; adjust fields if your Entry schema differs
        entry = await Entry.create({
          userId: task.userId || req.user?.id, // best guess tie
          date,
          title: title || `Journal for ${date}`,
          content: content || "",
        });
      }
      if (!entry) return res.status(404).json({ error: `No entry for date ${date}` });
    } else {
      return res.status(400).json({ error: "Provide entryId or date" });
    }

    task.entryId = entry._id;
    await task.save();

    return res.json({
      ok: true,
      taskId: String(task._id),
      entryId: String(task.entryId),
    });
  } catch (err) {
    console.error("[link-entry] error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.post("/tasks/:id/unlink-entry", auth, async (req, res) => {
  try {
    const taskId = req.params.id;
    if (!isObjectId(taskId)) return res.status(400).json({ error: "Invalid task id" });

    const task = await Task.findById(taskId);
    if (!task) return res.status(404).json({ error: "Task not found" });
    if (task.userId && req.user?.id && String(task.userId) !== String(req.user.id)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    task.entryId = null;
    await task.save();

    return res.json({
      ok: true,
      taskId: String(task._id),
      entryId: null,
    });
  } catch (err) {
    console.error("[unlink-entry] error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

/* -------------------------
   8) Sections rename (AUTH) — real alias
      POST /api/sections/rename  { id, name }  →  PUT /api/sections/:id { name }
   ------------------------- */
try {
  const { default: sectionsRouter } = await import("./sections.js");
  router.post("/sections/rename", auth, (req, res, next) => {
    const { id, name } = req.body || {};
    if (!id || !name) {
      return res.status(400).json({
        error: "Missing id or name",
        expectedBody: { id: "<sectionId>", name: "<newName>" },
      });
    }
    req.method = "PUT";
    req.url = `/sections/${encodeURIComponent(id)}`;
    req.body = { name };
    sectionsRouter(req, res, next);
  });
} catch (e) {
  console.warn("[compat] sections router not found for rename alias:", e.message);
}

export default router;
