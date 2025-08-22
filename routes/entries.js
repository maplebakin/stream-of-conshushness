// routes/entries.js
// ESM version — auto-creates ImportantEvents (date-only) and Appointments (date+time)
// Fallback: if NLP returns an appointment with no time, create an Important Event instead.

import express from "express";
import Entry from "../models/Entry.js";
import ImportantEvent from "../models/ImportantEvent.js";
import Appointment from "../models/Appointment.js";
import auth from "../middleware/auth.js";
import { analyzeEntry } from "../utils/analyzeEntry.js";

const router = express.Router();
router.use(auth);

function getUserId(req) {
  return req.user?.userId || req.user?._id || req.user?.id;
}

// Normalize date (expects YYYY-MM-DD in body; fallback: today)
function normalizeDate(d) {
  if (!d) {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  return d;
}

// HH:MM normalizer (accepts "9:5" → "09:05"; invalid → null)
function normalizeHHMM(v) {
  if (!v) return null;
  const [h = "", m = ""] = String(v).split(":");
  const hh = String(h).padStart(2, "0");
  const mm = String(m).padStart(2, "0");
  const out = `${hh}:${mm}`;
  return /^\d{2}:\d{2}$/.test(out) ? out : null;
}

/* -------- upserts used by NLP auto-creation -------- */
async function upsertImportantEvent({ userId, title, date, details = "", cluster = null }) {
  if (!userId || !title || !date) return;
  const dup = await ImportantEvent.findOne({ userId, title, date });
  if (dup) return dup;

  return ImportantEvent.create({
    userId,
    title: String(title).trim(),
    date,
    description: details || "",
    cluster: cluster || null,
    createdAt: new Date(),
  });
}

async function upsertAppointment({
  userId,
  title,
  date,
  timeStart,     // normalized "HH:MM" or null
  timeEnd = null,
  location = "",
  details = "",
  cluster = null,
  entryId = null,
}) {
  if (!userId || !title || !date || !timeStart) return null;

  const dup = await Appointment.findOne({ userId, title, date, timeStart });
  if (dup) return dup;

  return Appointment.create({
    userId,
    title: String(title).trim(),
    date,
    timeStart,
    timeEnd: timeEnd || null,
    location: location || "",
    details: details || "",
    // keep these extra fields only if your Appointment schema supports them
    ...(cluster ? { cluster } : {}),
    ...(entryId ? { entryId } : {}),
    createdAt: new Date(),
  });
}

/* --------------------------- Routes --------------------------- */

// List: /api/entries?section=Games
router.get("/", async (req, res) => {
  try {
    const userId = getUserId(req);
    const q = { userId };
    if (req.query.section) q.section = req.query.section;
    const rows = await Entry.find(q).sort({ date: -1, createdAt: -1 });
    res.json(rows);
  } catch (e) {
    console.error("GET /entries error", e);
    res.status(500).json({ error: "Server error" });
  }
});

// Get by date
router.get("/:date", async (req, res) => {
  try {
    const userId = getUserId(req);
    const rows = await Entry.find({ userId, date: req.params.date }).sort({ createdAt: -1 });
    res.json(rows);
  } catch (e) {
    console.error("GET /entries/:date error", e);
    res.status(500).json({ error: "Server error" });
  }
});

// Create
router.post("/", async (req, res) => {
  try {
    const userId = getUserId(req);
    const { text, html, mood, cluster, tags, linkedGoal, date } = req.body;

    const entry = await Entry.create({
      userId,
      date: normalizeDate(date),
      text: text || null,
      html: html || null,
      mood: mood || null,
      cluster: cluster || null,
      tags: Array.isArray(tags) ? tags : [],
      linkedGoal: linkedGoal || null,
      createdAt: new Date(),
    });

    // Analyze content → auto-create ImportantEvents / Appointments
    try {
      const analysis = analyzeEntry({ text, html }) || {};

      // 1) ImportantEvents (date-only)
      if (Array.isArray(analysis.importantEvents)) {
        for (const ev of analysis.importantEvents) {
          const title = (ev?.title || "").trim();
          const dateISO = ev?.date;
          if (!title || !dateISO) continue;
          await upsertImportantEvent({
            userId,
            title,
            date: dateISO,
            details: ev?.details || ev?.description || "",
            cluster,
          });
        }
      }

      // 2) Appointments (date + timeStart). Fallback to ImportantEvent if no/invalid time.
      if (Array.isArray(analysis.appointments)) {
        for (const ap of analysis.appointments) {
          const title = (ap?.title || "").trim();
          const dateISO = ap?.date;
          const timeNorm = normalizeHHMM(ap?.timeStart || ap?.time); // accept either field
          if (!title || !dateISO) continue;

          if (timeNorm) {
            await upsertAppointment({
              userId,
              title,
              date: dateISO,
              timeStart: timeNorm,
              timeEnd: normalizeHHMM(ap?.timeEnd) || null,
              location: ap?.location || "",
              details: ap?.details || ap?.notes || "",
              cluster,
              entryId: entry._id,
            });
          } else {
            // No time → store as Important Event (all-day)
            await upsertImportantEvent({
              userId,
              title,
              date: dateISO,
              details: ap?.details || ap?.notes || "",
              cluster,
            });
          }
        }
      }
    } catch (nlpErr) {
      console.warn("Entry NLP extraction failed (non-fatal):", nlpErr?.message || nlpErr);
    }

    res.status(201).json(entry);
  } catch (e) {
    console.error("POST /entries error", e);
    res.status(500).json({ error: "Server error" });
  }
});

// Update
router.patch("/:id", async (req, res) => {
  try {
    const userId = getUserId(req);
    const payload = {};
    ["text", "html", "mood", "cluster", "tags", "linkedGoal", "date"].forEach((k) => {
      if (k in req.body) payload[k] = req.body[k];
    });
    const doc = await Entry.findOneAndUpdate(
      { _id: req.params.id, userId },
      { $set: payload },
      { new: true }
    );
    if (!doc) return res.status(404).json({ error: "Not found" });
    res.json(doc);
  } catch (e) {
    console.error("PATCH /entries/:id error", e);
    res.status(500).json({ error: "Server error" });
  }
});

// Delete
router.delete("/:id", async (req, res) => {
  try {
    const userId = getUserId(req);
    const r = await Entry.findOneAndDelete({ _id: req.params.id, userId });
    if (!r) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true });
  } catch (e) {
    console.error("DELETE /entries/:id error", e);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
