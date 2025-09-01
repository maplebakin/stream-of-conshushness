// routes/events.js — Important Events CRUD (ESM) with date/pinned filters and alias fields
import express from "express";
import ImportantEvent from "../models/ImportantEvent.js";
import auth from "../middleware/auth.js";

const router = express.Router();
router.use(auth);

const isYMD = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
const toBool = (v) => {
  const s = String(v ?? "").toLowerCase();
  return s === "1" || s === "true" || s === "yes";
};
const trimOr = (v, d = "") => (typeof v === "string" ? v.trim() : d);

function userIdOf(req) {
  return req.user?.userId || req.user?._id || req.user?.id;
}

/* ------------------------- CREATE ------------------------- */
router.post("/", async (req, res) => {
  try {
    const userId = userIdOf(req);
    // accept both "description" and "details"
    const { title, date, description, details, cluster, pinned } = req.body || {};
    if (!title || !date) return res.status(400).json({ error: "title and date are required (YYYY-MM-DD)" });
    if (!isYMD(date))   return res.status(400).json({ error: "date must be YYYY-MM-DD" });

    const doc = {
      userId,
      title: trimOr(title),
      date,
      description: trimOr(description ?? details ?? ""),
      cluster: cluster || null,
      pinned: !!pinned,
    };

    // duplicate guard: same user + same date + same exact title
    const existing = await ImportantEvent.findOne({ userId, date, title: doc.title });
    if (existing) return res.status(200).json(existing);

    const ev = await ImportantEvent.create(doc);
    res.status(201).json(ev);
  } catch (e) {
    console.error("POST /important-events error", e);
    res.status(500).json({ error: "Server error" });
  }
});

/* ------------------------- LIST ------------------------- */
/**
 * GET /api/important-events
 * Query:
 *   - date=YYYY-MM-DD  (alias: on=)
 *   - from=YYYY-MM-DD&to=YYYY-MM-DD  (inclusive)
 *   - pinned=1|true    (optional)
 *   - cluster=<key>    (optional)
 */
router.get("/", async (req, res) => {
  try {
    const userId = userIdOf(req);
    const { date, on, from, to, pinned, cluster } = req.query || {};

    const q = { userId };
    const exact = date || on;
    if (exact) {
      if (!isYMD(exact)) return res.status(400).json({ error: "date must be YYYY-MM-DD" });
      q.date = exact;
    } else if (from || to) {
      q.date = {};
      if (from) {
        if (!isYMD(from)) return res.status(400).json({ error: "from must be YYYY-MM-DD" });
        q.date.$gte = from;
      }
      if (to) {
        if (!isYMD(to)) return res.status(400).json({ error: "to must be YYYY-MM-DD" });
        q.date.$lte = to;
      }
    }
    if (pinned !== undefined) q.pinned = toBool(pinned);
    if (cluster) q.cluster = cluster;

    const rows = await ImportantEvent.find(q).sort({ date: 1, createdAt: 1 }).lean();
    res.json(rows);
  } catch (e) {
    console.error("GET /important-events error", e);
    res.status(500).json({ error: "Server error" });
  }
});

/* ------------------------- READ ------------------------- */
router.get("/:id", async (req, res) => {
  try {
    const userId = userIdOf(req);
    const ev = await ImportantEvent.findOne({ _id: req.params.id, userId }).lean();
    if (!ev) return res.status(404).json({ error: "Not found" });
    res.json(ev);
  } catch (e) {
    console.error("GET /important-events/:id error", e);
    res.status(500).json({ error: "Server error" });
  }
});

/* ------------------------- UPDATE ------------------------- */
router.patch("/:id", async (req, res) => {
  try {
    const userId = userIdOf(req);
    const b = req.body || {};
    const updates = {};
    if (b.title !== undefined) updates.title = trimOr(b.title);
    if (b.date  !== undefined) {
      if (!isYMD(b.date)) return res.status(400).json({ error: "date must be YYYY-MM-DD" });
      updates.date = b.date;
    }
    // accept details->description alias on update too
    if (b.description !== undefined || b.details !== undefined) {
      updates.description = trimOr(b.description ?? b.details ?? "");
    }
    if (b.cluster !== undefined) updates.cluster = b.cluster || null;
    if (b.pinned  !== undefined) updates.pinned = !!b.pinned;

    const ev = await ImportantEvent.findOneAndUpdate(
      { _id: req.params.id, userId },
      { $set: updates, $currentDate: { updatedAt: true } },
      { new: true }
    ).lean();

    if (!ev) return res.status(404).json({ error: "Not found" });
    res.json(ev);
  } catch (e) {
    console.error("PATCH /important-events/:id error", e);
    res.status(500).json({ error: "Server error" });
  }
});

/* ------------------------- DELETE ------------------------- */
router.delete("/:id", async (req, res) => {
  try {
    const userId = userIdOf(req);
    const r = await ImportantEvent.findOneAndDelete({ _id: req.params.id, userId });
    if (!r) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true });
  } catch (e) {
    console.error("DELETE /important-events/:id error", e);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
