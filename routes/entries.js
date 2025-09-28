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
    if (req.query.startDate || req.query.endDate) {
      const range = {};
      if (req.query.startDate) range.$gte = normalizeDate(req.query.startDate);
      if (req.query.endDate) range.$lte = normalizeDate(req.query.endDate);
      q.date = range;
    }
    if (req.query.cluster) q.cluster = String(req.query.cluster);
    if (req.query.clusterId && ObjectId.isValid(req.query.clusterId)) {
      q.clusters = new ObjectId(req.query.clusterId);
    }

    const sectionFilters = [];
    if (req.query.section && String(req.query.section).trim()) {
      sectionFilters.push({ section: String(req.query.section).trim() });
    }
    if (req.query.sectionId && ObjectId.isValid(req.query.sectionId)) {
      sectionFilters.push({ sectionId: new ObjectId(req.query.sectionId) });
    }
    if (sectionFilters.length === 1) {
      Object.assign(q, sectionFilters[0]);
    } else if (sectionFilters.length > 1) {
      q.$or = sectionFilters;
    }
    if (req.query.sectionPageId && ObjectId.isValid(req.query.sectionPageId)) {
      q.sectionPageId = new ObjectId(req.query.sectionPageId);
    }
    if (req.query.mood) q.mood = String(req.query.mood);
    if (req.query.tag) q.tags = String(req.query.tag);
    if (req.query.pinned !== undefined) {
      const pinned = String(req.query.pinned).toLowerCase();
      if (["1", "true", "yes"].includes(pinned)) q.pinned = true;
      else if (["0", "false", "no"].includes(pinned)) q.pinned = false;
    }

    if (req.query.cursor && ObjectId.isValid(req.query.cursor)) {
      q._id = { $lt: new ObjectId(req.query.cursor) };
    }

    const limit = Math.min(Math.max(parseInt(req.query.limit || "100", 10), 1), 500);
    const rows = await Entry.find(q)
      .sort({ pinned: -1, date: -1, createdAt: -1, _id: -1 })
      .limit(limit);
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
