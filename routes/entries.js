// routes/entries.js
// Solidified entries API with:
// - Toronto-safe date normalization
// - GET by ID and GET by date (moved to /by-date/:date to avoid id clash)
// - Query filtering (date, cluster, section, sectionId, sectionPageId, limit, tag, mood)
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

function escapeRegExp(value) {
  return String(value || "").replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
}

/* --------------------------- Routes --------------------------- */

// List with flexible filters
// GET /api/entries?date=YYYY-MM-DD&cluster=Home&section=Games&sectionPageId=...&limit=50
router.get("/", async (req, res) => {
  try {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const query = { userId };

    const orClauses = [];
    if (req.query.sectionId) {
      if (!ObjectId.isValid(req.query.sectionId)) {
        return res.status(400).json({ error: "Invalid sectionId" });
      }
      orClauses.push({ sectionId: new ObjectId(req.query.sectionId) });
    }
    if (req.query.section) {
      orClauses.push({ section: String(req.query.section) });
    }

    if (orClauses.length === 1) {
      Object.assign(query, orClauses[0]);
    } else if (orClauses.length > 1) {
      query.$or = orClauses;
    }

    if (req.query.date) {
      query.date = normalizeDate(req.query.date);
    } else {
      const dateRange = {};
      if (req.query.startDate) {
        dateRange.$gte = normalizeDate(req.query.startDate);
      }
      if (req.query.endDate) {
        dateRange.$lte = normalizeDate(req.query.endDate);
      }
      if (Object.keys(dateRange).length) {
        query.date = dateRange;
      }
    }

    if (req.query.cluster) query.cluster = String(req.query.cluster);
    if (req.query.sectionPageId && ObjectId.isValid(req.query.sectionPageId)) {
      query.sectionPageId = new ObjectId(req.query.sectionPageId);
    }

    if (req.query.mood) {
      const mood = String(req.query.mood).trim();
      if (mood) {
        query.mood = new RegExp(`^${escapeRegExp(mood)}$`, "i");
      }
    }

    if (req.query.tag) {
      const raw = Array.isArray(req.query.tag)
        ? req.query.tag.flatMap((t) => String(t).split(","))
        : String(req.query.tag).split(",");
      const tagPatterns = raw
        .map((t) => String(t).trim())
        .filter(Boolean)
        .map((t) => new RegExp(`^${escapeRegExp(t)}$`, "i"));

      if (tagPatterns.length === 1) {
        query.tags = tagPatterns[0];
      } else if (tagPatterns.length > 1) {
        query.tags = { $in: tagPatterns };
      }
    }

    if (Object.prototype.hasOwnProperty.call(req.query, "pinned")) {
      const rawPinned = String(req.query.pinned).toLowerCase();
      if (rawPinned === "true" || rawPinned === "1") query.pinned = true;
      else if (rawPinned === "false" || rawPinned === "0") query.pinned = false;
    }

    const limitRaw = parseInt(req.query.limit ?? "100", 10);
    const limit = Number.isFinite(limitRaw)
      ? Math.min(Math.max(limitRaw, 1), 500)
      : 100;

    const offsetRaw = parseInt(req.query.offset ?? "0", 10);
    const offset = Number.isFinite(offsetRaw) ? Math.max(offsetRaw, 0) : 0;

    const rows = await Entry.find(query)
      .sort({ pinned: -1, date: -1, createdAt: -1, _id: -1 })
      .skip(offset)
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
