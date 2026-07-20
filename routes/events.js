// routes/events.js — Important Events CRUD (ESM) with date/pinned filters and alias fields
import express from "express";
import ImportantEvent from "../models/ImportantEvent.js";
import { logSafeError } from '../utils/errorHandler.js';
import { resolveOwnedEntryId } from '../utils/ownedReferences.js';
import { isValidISODate } from '../utils/recurrence.js';

const router = express.Router();
const isYMD = isValidISODate;
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
    const { title, date, description, details, cluster, pinned, entryId } = req.body || {};
    if (!title || !date) return res.status(400).json({ error: "title and date are required (YYYY-MM-DD)" });
    if (!isYMD(date))   return res.status(400).json({ error: "date must be YYYY-MM-DD" });
    const ownedEntryId = entryId ? await resolveOwnedEntryId(userId, entryId) : null;
    if (entryId && !ownedEntryId) return res.status(400).json({ error: 'entryId must reference one of your entries' });

    const doc = {
      userId,
      title: trimOr(title),
      date,
      description: trimOr(description ?? details ?? ""),
      cluster: cluster || null,
      pinned: !!pinned,
      entryId: ownedEntryId,
    };

    // duplicate guard: same user + same date + same exact title
    const existing = await ImportantEvent.findOne({ userId, date, title: doc.title });
    if (existing) return res.status(200).json(existing);

    const ev = await ImportantEvent.create(doc);
    res.status(201).json(ev);
  } catch (e) {
    logSafeError('important events create failed', e);
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

    const q = { userId, automationReviewStatus: { $nin: ["pending", "dismissed"] } };
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
    logSafeError('important events list failed', e);
    res.status(500).json({ error: "Server error" });
  }
});

/* ------------------------- READ ------------------------- */
router.get("/:id", async (req, res) => {
  try {
    const userId = userIdOf(req);
    const ev = await ImportantEvent.findOne({
      _id: req.params.id,
      userId,
      automationReviewStatus: { $nin: ["pending", "dismissed"] },
    }).lean();
    if (!ev) return res.status(404).json({ error: "Not found" });
    res.json(ev);
  } catch (e) {
    logSafeError('important events get failed', e);
    res.status(500).json({ error: "Server error" });
  }
});

/* ------------------------- AUTOMATION REVIEW ------------------------- */
router.patch("/:id/review", async (req, res) => {
  try {
    const userId = userIdOf(req);
    const action = String(req.body?.action || "").trim();
    if (!["keep", "dismiss"].includes(action)) {
      return res.status(400).json({ error: "action must be keep or dismiss" });
    }
    const ev = await ImportantEvent.findOneAndUpdate(
      { _id: req.params.id, userId, source: "entry-automation" },
      { $set: { automationReviewStatus: action === "keep" ? "kept" : "dismissed" } },
      { new: true, runValidators: true }
    ).lean();
    if (!ev) return res.status(404).json({ error: "Not found" });
    return res.json(ev);
  } catch (e) {
    logSafeError('important event review decision failed', e);
    return res.status(500).json({ error: "Server error" });
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
    if (b.entryId !== undefined) {
      const entryId = b.entryId ? await resolveOwnedEntryId(userId, b.entryId) : null;
      if (b.entryId && !entryId) return res.status(400).json({ error: 'entryId must reference one of your entries' });
      updates.entryId = entryId;
    }
    if (Object.keys(updates).length) {
      updates.source = "user-edited";
      updates.automationReviewStatus = "kept";
    }

    const ev = await ImportantEvent.findOneAndUpdate(
      { _id: req.params.id, userId },
      { $set: updates, $currentDate: { updatedAt: true } },
      { new: true }
    ).lean();

    if (!ev) return res.status(404).json({ error: "Not found" });
    res.json(ev);
  } catch (e) {
    logSafeError('important events update failed', e);
    res.status(500).json({ error: "Server error" });
  }
});

/* ------------------------- DELETE ------------------------- */
router.delete("/:id", async (req, res) => {
  try {
    const userId = userIdOf(req);
    const event = await ImportantEvent.findOne({ _id: req.params.id, userId });
    if (!event) return res.status(404).json({ error: "Not found" });
    if (event.entryId && ["entry-automation", "user-edited"].includes(event.source)) {
      event.source = "entry-automation";
      event.automationReviewStatus = "dismissed";
      await event.save();
      return res.json({ ok: true, dismissed: event._id });
    }
    await ImportantEvent.deleteOne({ _id: event._id, userId });
    res.json({ ok: true, deleted: event._id });
  } catch (e) {
    logSafeError('important events delete failed', e);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
