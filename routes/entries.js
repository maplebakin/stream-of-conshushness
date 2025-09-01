// routes/entries.js
// Solidified entries API with:
// - Toronto-safe date normalization
// - GET by ID and GET by date (moved to /by-date/:date to avoid id clash)
// - Query filtering (date, cluster, section, sectionPageId, limit)
// - NLP hooks for ImportantEvents/Appointments (non-fatal)

import express from "express";
import mongoose from "mongoose";
import Entry from "../models/Entry.js";
import ImportantEvent from "../models/ImportantEvent.js";
import Appointment from "../models/Appointment.js";
import auth from "../middleware/auth.js";
import { analyzeEntry } from "../utils/analyzeEntry.js";

const router = express.Router();
// NOTE: server.js already mounts with `auth`; keeping this guard is safe but optional.
router.use(auth);

const { ObjectId } = mongoose.Types;

function getUserId(req) {
  return req.user?.userId || req.user?._id || req.user?.id;
}

// YYYY-MM-DD using a specific IANA timezone (defaults to America/Toronto)
function todayISOInTZ(timeZone = "America/Toronto") {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric", month: "2-digit", day: "2-digit",
  });
  const [{ value: y }, , { value: m }, , { value: d }] = fmt.formatToParts(new Date());
  return `${y}-${m}-${d}`;
}

// Normalize input to YYYY-MM-DD. If empty, use Toronto "today".
function normalizeDate(input) {
  if (!input) return todayISOInTZ();
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(input))) return String(input);
  const dt = new Date(input);
  if (isNaN(dt.getTime())) return todayISOInTZ();
  // Format that Date in Toronto
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric", month: "2-digit", day: "2-digit",
  });
  const [{ value: y }, , { value: m }, , { value: d }] = fmt.formatToParts(dt);
  return `${y}-${m}-${d}`;
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
    ...(cluster ? { cluster } : {}),
    ...(entryId ? { entryId } : {}),
    createdAt: new Date(),
  });
}

/* --------------------------- Routes --------------------------- */

// List with flexible filters
// GET /api/entries?date=YYYY-MM-DD&cluster=Home&section=Games&sectionPageId=...&limit=50
router.get("/", async (req, res) => {
  try {
    const userId = getUserId(req);
    const q = { userId };

    if (req.query.date) q.date = normalizeDate(req.query.date);
    if (req.query.cluster) q.cluster = String(req.query.cluster);
    if (req.query.section) q.section = String(req.query.section);
    if (req.query.sectionPageId && ObjectId.isValid(req.query.sectionPageId)) {
      q.sectionPageId = new ObjectId(req.query.sectionPageId);
    }

    const limit = Math.min(Math.max(parseInt(req.query.limit || "100", 10), 1), 500);
    const rows = await Entry.find(q).sort({ date: -1, createdAt: -1 }).limit(limit);
    res.json(rows);
  } catch (e) {
    console.error("GET /entries error", e);
    res.status(500).json({ error: "Server error" });
  }
});

// Get by ID (distinct from date)
router.get("/:id", async (req, res) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid id" });
    const doc = await Entry.findOne({ _id: id, userId });
    if (!doc) return res.status(404).json({ error: "Not found" });
    res.json(doc);
  } catch (e) {
    console.error("GET /entries/:id error", e);
    res.status(500).json({ error: "Server error" });
  }
});

// Get by date (moved to avoid clashing with :id)
router.get("/by-date/:date", async (req, res) => {
  try {
    const userId = getUserId(req);
    const dateISO = normalizeDate(req.params.date);
    const rows = await Entry.find({ userId, date: dateISO }).sort({ createdAt: -1 });
    res.json(rows);
  } catch (e) {
    console.error("GET /entries/by-date/:date error", e);
    res.status(500).json({ error: "Server error" });
  }
});

// Create
router.post("/", async (req, res) => {
  try {
    const userId = getUserId(req);
    const {
      text,
      content,
      html,
      mood,
      cluster,
      tags,
      linkedGoal,
      date,
      section,
      sectionPageId,
    } = req.body;

    const entry = await Entry.create({
      userId,
      date: normalizeDate(date),
      text: text ?? (typeof content === "string" ? content : ""),
      html: html ?? "",
      mood: mood ?? "",
      cluster: cluster ?? "",
      tags: Array.isArray(tags) ? tags : [],
      linkedGoal: linkedGoal || null,
      section: section ?? "",
      sectionPageId: ObjectId.isValid(sectionPageId) ? sectionPageId : null,
    });

    // Analyze content → auto-create ImportantEvents / Appointments
    try {
      const analysis = analyzeEntry({ text: entry.text, html: entry.html }) || {};

      // 1) ImportantEvents (date-only)
      if (Array.isArray(analysis.importantEvents)) {
        for (const ev of analysis.importantEvents) {
          const title = (ev?.title || "").trim();
          const dateISO = normalizeDate(ev?.date);
          if (!title || !dateISO) continue;
          await upsertImportantEvent({
            userId,
            title,
            date: dateISO,
            details: ev?.details || ev?.description || "",
            cluster: entry.cluster || null,
          });
        }
      }

      // 2) Appointments (date + timeStart). Fallback to ImportantEvent if no/invalid time.
      if (Array.isArray(analysis.appointments)) {
        for (const ap of analysis.appointments) {
          const title = (ap?.title || "").trim();
          const dateISO = normalizeDate(ap?.date);
          const timeNorm = normalizeHHMM(ap?.timeStart || ap?.time);
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
              cluster: entry.cluster || null,
              entryId: entry._id,
            });
          } else {
            await upsertImportantEvent({
              userId,
              title,
              date: dateISO,
              details: ap?.details || ap?.notes || "",
              cluster: entry.cluster || null,
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
    ["text", "html", "mood", "cluster", "tags", "linkedGoal", "date", "section", "sectionPageId"].forEach((k) => {
      if (k in req.body) payload[k] = req.body[k];
    });
    if ("date" in payload) payload.date = normalizeDate(payload.date);
    if ("sectionPageId" in payload && !ObjectId.isValid(payload.sectionPageId)) {
      payload.sectionPageId = null;
    }

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
