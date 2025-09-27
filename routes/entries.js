// routes/entries.js
// Solidified entries API with:
// - Toronto-safe date normalization
// - GET by ID and GET by date (moved to /by-date/:date to avoid id clash)
// - Query filtering (date, cluster, section, sectionPageId, limit)
// - NLP hooks for ImportantEvents/Appointments (non-fatal)

import express from "express";
import mongoose from "mongoose";
import Entry from "../models/Entry.js";
import {
  createEntryWithAutomation,
  updateEntryWithAutomation,
  normalizeDate,
  getUserIdFromRequest,
} from "../utils/entryAutomation.js";

const router = express.Router();

const { ObjectId } = mongoose.Types;

/* --------------------------- Routes --------------------------- */

// List with flexible filters
// GET /api/entries?date=YYYY-MM-DD&cluster=Home&section=Games&sectionPageId=...&limit=50
router.get("/", async (req, res) => {
  try {
    const userId = getUserIdFromRequest(req);
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
    const userId = getUserIdFromRequest(req);
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
    const userId = getUserIdFromRequest(req);
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
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const entry = await createEntryWithAutomation({ userId, payload: req.body || {} });
    res.status(201).json(entry);
  } catch (e) {
    console.error("POST /entries error", e);
    res.status(500).json({ error: "Server error" });
  }
});

// Update
router.patch("/:id", async (req, res) => {
  try {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid id" });

    const doc = await updateEntryWithAutomation({ userId, entryId: id, updates: req.body || {} });
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
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid id" });

    const r = await Entry.findOneAndDelete({ _id: id, userId });
    if (!r) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true });
  } catch (e) {
    console.error("DELETE /entries/:id error", e);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
