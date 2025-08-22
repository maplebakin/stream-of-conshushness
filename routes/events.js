// routes/events.js
// ESM version — Important Events CRUD with duplicate guard and light validation

import express from "express";
import ImportantEvent from "../models/ImportantEvent.js";
import auth from "../middleware/auth.js";

const router = express.Router();
router.use(auth);

function getUserId(req) {
  return req.user?.userId || req.user?._id || req.user?.id;
}

function isValidYMD(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

// Create
router.post("/", async (req, res) => {
  try {
    const userId = getUserId(req);
    const { title, date, description, cluster, pinned } = req.body;

    if (!title || !date) {
      return res.status(400).json({ error: "title and date are required (YYYY-MM-DD)" });
    }
    if (!isValidYMD(date)) {
      return res.status(400).json({ error: "date must be YYYY-MM-DD" });
    }

    const existing = await ImportantEvent.findOne({ userId, title: title.trim(), date });
    if (existing) return res.status(200).json(existing);

    const ev = await ImportantEvent.create({
      userId,
      title: title.trim(),
      date,
      description: description || "",
      cluster: cluster || null,
      pinned: !!pinned,
      createdAt: new Date(),
    });

    res.status(201).json(ev);
  } catch (e) {
    console.error("POST /events error", e);
    res.status(500).json({ error: "Server error" });
  }
});

// List (optional filters: ?from=YYYY-MM-DD&to=YYYY-MM-DD)
router.get("/", async (req, res) => {
  try {
    const userId = getUserId(req);
    const { from, to } = req.query;

    const q = { userId };
    if (from || to) q.date = {};
    if (from) q.date.$gte = from;
    if (to) q.date.$lte = to;

    const rows = await ImportantEvent.find(q).sort({ date: 1, createdAt: 1 });
    res.json(rows);
  } catch (e) {
    console.error("GET /events error", e);
    res.status(500).json({ error: "Server error" });
  }
});

// Read by id
router.get("/:id", async (req, res) => {
  try {
    const userId = getUserId(req);
    const ev = await ImportantEvent.findOne({ _id: req.params.id, userId });
    if (!ev) return res.status(404).json({ error: "Not found" });
    res.json(ev);
  } catch (e) {
    console.error("GET /events/:id error", e);
    res.status(500).json({ error: "Server error" });
  }
});

// Update
router.patch("/:id", async (req, res) => {
  try {
    const userId = getUserId(req);
    const payload = {};
    ["title", "date", "description", "cluster", "pinned"].forEach((k) => {
      if (k in req.body) payload[k] = k === "pinned" ? !!req.body[k] : req.body[k];
    });

    if ("date" in payload && !isValidYMD(payload.date)) {
      return res.status(400).json({ error: "date must be YYYY-MM-DD" });
    }
    if ("title" in payload && typeof payload.title === "string") {
      payload.title = payload.title.trim();
    }

    const ev = await ImportantEvent.findOneAndUpdate(
      { _id: req.params.id, userId },
      { $set: payload },
      { new: true }
    );
    if (!ev) return res.status(404).json({ error: "Not found" });
    res.json(ev);
  } catch (e) {
    console.error("PATCH /events/:id error", e);
    res.status(500).json({ error: "Server error" });
  }
});

// Delete
router.delete("/:id", async (req, res) => {
  try {
    const userId = getUserId(req);
    const r = await ImportantEvent.findOneAndDelete({ _id: req.params.id, userId });
    if (!r) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true });
  } catch (e) {
    console.error("DELETE /events/:id error", e);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
