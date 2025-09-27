import mongoose from "mongoose";
import Entry from "../models/Entry.js";
import ImportantEvent from "../models/ImportantEvent.js";
import Appointment from "../models/Appointment.js";
import Ripple from "../models/Ripple.js";
import SuggestedTask from "../models/SuggestedTask.js";

import analyzeEntry from "./analyzeEntry.js";
import { extractEntrySuggestions, extractRipplesFromEntry } from "./rippleExtractor.js";
import { sieveRipples } from "./rippleSieve.js";

const { ObjectId } = mongoose.Types;
const DEFAULT_TIME_ZONE = "America/Toronto";

/* ------------------------------------------------------------------ */
/* Time helpers                                                        */
/* ------------------------------------------------------------------ */

export function todayISOInTZ(timeZone = DEFAULT_TIME_ZONE, base = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(base);
  const y = parts.find((p) => p.type === "year")?.value || "0000";
  const m = parts.find((p) => p.type === "month")?.value || "01";
  const d = parts.find((p) => p.type === "day")?.value || "01";
  return `${y}-${m}-${d}`;
}

export function normalizeDate(value, timeZone = DEFAULT_TIME_ZONE) {
  if (!value) return todayISOInTZ(timeZone);
  const str = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  const dt = new Date(str);
  if (Number.isNaN(dt.getTime())) return todayISOInTZ(timeZone);
  return todayISOInTZ(timeZone, dt);
}

export function normalizeHHMM(v) {
  if (!v && v !== 0) return null;
  const [h = "", m = ""] = String(v).split(":");
  const hh = String(h).padStart(2, "0");
  const mm = String(m).padStart(2, "0");
  const out = `${hh}:${mm}`;
  return /^\d{2}:\d{2}$/.test(out) ? out : null;
}

/* ------------------------------------------------------------------ */
/* Identity helpers                                                    */
/* ------------------------------------------------------------------ */

export function getUserIdFromRequest(req) {
  return req.user?.userId || req.user?._id || req.user?.id || null;
}

function toObjectIdOrNull(value) {
  if (value == null || value === "") return null;
  try {
    if (value instanceof ObjectId) return value;
    if (ObjectId.isValid(value)) return new ObjectId(value);
  } catch {}
  return null;
}

/* ------------------------------------------------------------------ */
/* Text helpers                                                        */
/* ------------------------------------------------------------------ */

const stripHtml = (s) => String(s || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

export function plainTextFrom({ text, html, content }) {
  if (typeof text === "string" && text.trim()) return text.trim();
  const src =
    (typeof content === "string" && content.trim()) ? content :
    (typeof html === "string" && html.trim()) ? html : "";
  return stripHtml(src);
}

export function deDupeTags(raw) {
  const arr = Array.isArray(raw)
    ? raw
    : raw == null
      ? []
      : String(raw)
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
  const seen = new Set();
  const out = [];
  for (const tag of arr) {
    if (!tag) continue;
    const lower = tag.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    out.push(tag);
  }
  return out;
}

function analyzeEntrySafe({ text, html, date }) {
  try {
    const baseDate = date ? new Date(`${date}T12:00:00`) : undefined;
    return analyzeEntry({ text, html, baseDate }) || null;
  } catch (err) {
    console.warn("[entryAutomation] analyzeEntry failed:", err?.message || err);
    return null;
  }
}

function buildSuggestedTasks({ text, date, cluster, section }) {
  try {
    const tasks = extractEntrySuggestions(text || "", date) || [];
    if (!Array.isArray(tasks) || !tasks.length) return [];
    return tasks.slice(0, 25).map((t) => ({
      title: t?.text ? String(t.text).trim() : "",
      dueDate: t?.dueDate ? String(t.dueDate) : "",
      repeat: t?.recurrence ? String(t.recurrence) : "",
      cluster: cluster || "",
      section: section || "",
      status: "new",
    })).filter((t) => t.title);
  } catch (err) {
    console.warn("[entryAutomation] extractEntrySuggestions failed:", err?.message || err);
    return [];
  }
}

async function upsertImportantEvent({ userId, title, date, details = "", cluster = null }) {
  if (!userId || !title || !date) return null;
  const doc = await ImportantEvent.findOne({ userId, title, date });
  if (doc) return doc;
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
  timeStart,
  timeEnd = null,
  location = "",
  details = "",
  cluster = null,
  entryId = null,
}) {
  if (!userId || !title || !date || !timeStart) return null;
  const existing = await Appointment.findOne({ userId, title, date, timeStart });
  if (existing) return existing;
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

async function runNlpSideEffects({ entry, analysis, userId }) {
  if (!analysis) return;
  try {
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
    if (Array.isArray(analysis.appointments)) {
      for (const ap of analysis.appointments) {
        const title = (ap?.title || "").trim();
        const dateISO = normalizeDate(ap?.date);
        if (!title || !dateISO) continue;
        const timeNorm = normalizeHHMM(ap?.timeStart || ap?.time);
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
  } catch (err) {
    console.warn("[entryAutomation] NLP side-effects failed:", err?.message || err);
  }
}

function dedupeRipplesByText(ripples = []) {
  const seen = new Set();
  const out = [];
  for (const r of ripples || []) {
    const text = String(r?.extractedText || r?.text || "").trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...r, text });
  }
  return out;
}

function isoDateToUTCDate(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(String(iso))) return null;
  const [y, m, d] = iso.split("-").map((n) => parseInt(n, 10));
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
}

export async function clearRippleArtifacts({ userId, entryId }) {
  if (!userId || !entryId) return;
  const rippleIds = await Ripple.find({ userId, entryId }).select("_id");
  const ids = rippleIds.map((r) => r._id);
  if (ids.length) {
    await SuggestedTask.deleteMany({ userId, sourceRippleId: { $in: ids } });
  }
  await Ripple.deleteMany({ userId, entryId });
}

async function safeInsertMany(Model, docs) {
  if (!Array.isArray(docs) || docs.length === 0) return [];
  try {
    return await Model.insertMany(docs, { ordered: false });
  } catch (err) {
    console.warn(`[entryAutomation] ${Model.modelName}.insertMany partially failed:`, err?.message || err);
    const insertedIds = err?.result?.insertedIds;
    if (insertedIds) {
      const ids = Object.values(insertedIds);
      if (ids.length) {
        return Model.find({ _id: { $in: ids } });
      }
    }
    return [];
  }
}

async function generateRipplesAndSuggestions({ entry, text, userId }) {
  const basis = String(text || entry?.text || entry?.content || "").trim();
  if (!basis) return { ripples: [], suggestedTasks: [] };

  let extracted = [];
  try {
    const res = extractRipplesFromEntry({
      text: basis,
      entryDate: entry.date,
      originalContext: basis,
    });
    extracted = Array.isArray(res?.ripples) ? res.ripples : [];
  } catch (err) {
    console.warn("[entryAutomation] extractRipplesFromEntry failed:", err?.message || err);
  }

  const filtered = sieveRipples(extracted);
  const deduped = dedupeRipplesByText(filtered);
  if (!deduped.length) return { ripples: [], suggestedTasks: [] };

  const rippleDocs = await safeInsertMany(
    Ripple,
    deduped.map((r) => ({
      userId,
      entryId: entry._id,
      dateKey: entry.date,
      section: entry.section || entry.cluster || "",
      text: r.text,
      score: Math.round(((r?.confidence ?? 0.6) || 0) * 100),
      status: "pending",
      source: "entry-automation",
    }))
  );

  if (!rippleDocs.length) return { ripples: [], suggestedTasks: [] };

  const suggestionPayloads = rippleDocs.map((doc, idx) => {
    const src = deduped[idx] || {};
    const dueISO = src?.meta?.dueDate;
    const repeat = src?.meta?.recurrenceLabel || src?.meta?.recurrence || "";
    const payload = {
      userId,
      sourceRippleId: doc._id,
      title: doc.text,
      priority: "low",
      cluster: entry.cluster || "",
      section: entry.section || "",
    };
    const dueDate = isoDateToUTCDate(dueISO);
    if (dueDate) payload.dueDate = dueDate;
    if (repeat) payload.repeat = repeat;
    return payload;
  }).filter((p) => p.title);

  await safeInsertMany(SuggestedTask, suggestionPayloads);
  return { ripples: rippleDocs, suggestedTasks: suggestionPayloads };
}

function normalizeEntryForCreate(payload = {}) {
  const normalized = normalizeEntryForUpdate(payload, {});
  if (!("date" in normalized)) normalized.date = normalizeDate(payload.date);
  if (!("text" in normalized)) {
    const text = plainTextFrom({ text: payload.text, html: payload.html, content: payload.content });
    normalized.text = text;
    normalized.html = typeof payload.html === "string" ? payload.html : "";
    normalized.content = typeof payload.content === "string" ? payload.content : normalized.html;
  } else {
    if (!("html" in normalized)) normalized.html = typeof payload.html === "string" ? payload.html : "";
    if (!("content" in normalized)) normalized.content = typeof payload.content === "string" ? payload.content : normalized.html;
  }
  if (!("mood" in normalized)) normalized.mood = typeof payload.mood === "string" ? payload.mood : "";
  if (!("cluster" in normalized)) normalized.cluster = typeof payload.cluster === "string" ? payload.cluster : "";
  if (!("section" in normalized)) normalized.section = typeof payload.section === "string" ? payload.section : "";
  if (!("tags" in normalized)) normalized.tags = deDupeTags(payload.tags);
  if (!("linkedGoal" in normalized)) normalized.linkedGoal = toObjectIdOrNull(payload.linkedGoal);
  if (!("sectionPageId" in normalized)) normalized.sectionPageId = toObjectIdOrNull(payload.sectionPageId);
  return normalized;
}

function normalizeEntryForUpdate(payload = {}, existing = {}) {
  const normalized = {};
  if (Object.prototype.hasOwnProperty.call(payload, "date")) {
    normalized.date = normalizeDate(payload.date);
  }
  if (
    Object.prototype.hasOwnProperty.call(payload, "text") ||
    Object.prototype.hasOwnProperty.call(payload, "html") ||
    Object.prototype.hasOwnProperty.call(payload, "content")
  ) {
    const nextText = plainTextFrom({
      text: Object.prototype.hasOwnProperty.call(payload, "text") ? payload.text : existing.text,
      html: Object.prototype.hasOwnProperty.call(payload, "html") ? payload.html : existing.html,
      content: Object.prototype.hasOwnProperty.call(payload, "content") ? payload.content : existing.content,
    });
    normalized.text = nextText;
    normalized.html = typeof (Object.prototype.hasOwnProperty.call(payload, "html") ? payload.html : existing.html) === "string"
      ? (Object.prototype.hasOwnProperty.call(payload, "html") ? payload.html : existing.html)
      : "";
    normalized.content = typeof (Object.prototype.hasOwnProperty.call(payload, "content") ? payload.content : existing.content) === "string"
      ? (Object.prototype.hasOwnProperty.call(payload, "content") ? payload.content : existing.content)
      : normalized.html;
  }
  if (Object.prototype.hasOwnProperty.call(payload, "mood")) {
    normalized.mood = typeof payload.mood === "string" ? payload.mood : "";
  }
  if (Object.prototype.hasOwnProperty.call(payload, "cluster")) {
    normalized.cluster = typeof payload.cluster === "string" ? payload.cluster : "";
  }
  if (Object.prototype.hasOwnProperty.call(payload, "section")) {
    normalized.section = typeof payload.section === "string" ? payload.section : "";
  }
  if (Object.prototype.hasOwnProperty.call(payload, "tags")) {
    normalized.tags = deDupeTags(payload.tags);
  }
  if (Object.prototype.hasOwnProperty.call(payload, "linkedGoal")) {
    normalized.linkedGoal = toObjectIdOrNull(payload.linkedGoal);
  }
  if (Object.prototype.hasOwnProperty.call(payload, "sectionPageId")) {
    normalized.sectionPageId = toObjectIdOrNull(payload.sectionPageId);
  }
  return normalized;
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

export async function createEntryWithAutomation({ userId, payload = {} }) {
  const normalized = normalizeEntryForCreate(payload);
  const analysis = analyzeEntrySafe({
    text: normalized.text,
    html: normalized.html,
    date: normalized.date,
  });
  const mergedTags = deDupeTags([...(normalized.tags || []), ...((analysis?.tags || []))]);
  const suggestedTasks = buildSuggestedTasks({
    text: normalized.text,
    date: normalized.date,
    cluster: normalized.cluster,
    section: normalized.section,
  });

  const entry = await Entry.create({
    userId,
    date: normalized.date,
    text: normalized.text,
    html: normalized.html,
    content: normalized.content,
    mood: normalized.mood,
    cluster: normalized.cluster,
    section: normalized.section,
    tags: mergedTags,
    linkedGoal: normalized.linkedGoal,
    sectionPageId: normalized.sectionPageId,
    suggestedTasks,
  });

  await runNlpSideEffects({ entry, analysis, userId });
  await generateRipplesAndSuggestions({ entry, text: normalized.text, userId });

  return entry;
}

export async function updateEntryWithAutomation({ userId, entryId, updates = {} }) {
  const entry = await Entry.findOne({ _id: entryId, userId });
  if (!entry) return null;

  const normalized = normalizeEntryForUpdate(updates, entry);
  let coreChanged = false;

  if (Object.prototype.hasOwnProperty.call(normalized, "date")) {
    entry.date = normalized.date;
    coreChanged = true;
  }
  if (Object.prototype.hasOwnProperty.call(normalized, "text")) {
    entry.text = normalized.text;
    entry.html = normalized.html || "";
    entry.content = normalized.content || "";
    coreChanged = true;
  }
  if (Object.prototype.hasOwnProperty.call(normalized, "mood")) {
    entry.mood = normalized.mood || "";
  }
  if (Object.prototype.hasOwnProperty.call(normalized, "cluster")) {
    entry.cluster = normalized.cluster || "";
  }
  if (Object.prototype.hasOwnProperty.call(normalized, "section")) {
    entry.section = normalized.section || "";
  }
  if (Object.prototype.hasOwnProperty.call(normalized, "linkedGoal")) {
    entry.linkedGoal = normalized.linkedGoal;
  }
  if (Object.prototype.hasOwnProperty.call(normalized, "sectionPageId")) {
    entry.sectionPageId = normalized.sectionPageId;
  }
  if (Object.prototype.hasOwnProperty.call(normalized, "tags")) {
    entry.tags = normalized.tags;
  }

  let analysis = null;
  if (coreChanged) {
    analysis = analyzeEntrySafe({ text: entry.text, html: entry.html, date: entry.date });
    entry.tags = deDupeTags([...(entry.tags || []), ...((analysis?.tags || []))]);
    entry.suggestedTasks = buildSuggestedTasks({
      text: entry.text,
      date: entry.date,
      cluster: entry.cluster,
      section: entry.section,
    });
  }

  const updated = await entry.save();

  if (coreChanged) {
    await runNlpSideEffects({ entry: updated, analysis, userId });
  }

  await clearRippleArtifacts({ userId, entryId: updated._id });
  await generateRipplesAndSuggestions({ entry: updated, text: updated.text, userId });

  return updated;
}

export default {
  todayISOInTZ,
  normalizeDate,
  normalizeHHMM,
  getUserIdFromRequest,
  deDupeTags,
  plainTextFrom,
  createEntryWithAutomation,
  updateEntryWithAutomation,
  clearRippleArtifacts,
};
