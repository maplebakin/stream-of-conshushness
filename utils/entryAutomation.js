import mongoose from "mongoose";
import Entry from "../models/Entry.js";
import ImportantEvent from "../models/ImportantEvent.js";
import Appointment from "../models/Appointment.js";
import Ripple from "../models/Ripple.js";
import SuggestedTask from "../models/SuggestedTask.js";
import SuggestedGatherItem from "../models/SuggestedGatherItem.js";
import GatherItem from "../models/GatherItem.js";
import SuggestedInterest from "../models/SuggestedInterest.js";
import Interest from "../models/Interest.js";
import Cluster from "../models/Cluster.js";
import { normalizeClusterIds, resolveClusterIdForOwner } from "./clusterIds.js";

import * as chrono from "chrono-node";
import analyzeEntry from "./analyzeEntry.js";
import { extractEntrySuggestions, extractRipplesFromEntry } from "./rippleExtractor.js";
import { sieveRipples } from "./rippleSieve.js";
import { extractGatherItems, hasScheduledActionSignal, normalizeGatherTitleKey } from "./gatherExtractor.js";
import { extractInterests, normalizeInterestTitleKey } from "./interestExtractor.js";

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

/* ------------------------------------------------------------------ */
/* Suggestion helpers                                                  */
/* ------------------------------------------------------------------ */

function normalizeOptionalString(value) {
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  return normalized || "";
}

function buildSuggestedTasks(options = {}) {
  const { text, date, cluster, section } = options || {};
  try {
    const tasks = extractEntrySuggestions(text || "", date) || [];
    if (!Array.isArray(tasks) || !tasks.length) return [];
    const clusterKey = normalizeOptionalString(cluster);
    const sectionKey = normalizeOptionalString(section);

    return tasks
      .slice(0, 25)
      .map((t) => ({
        title: t?.text ? String(t.text).trim() : "",
        dueDate: t?.dueDate ? String(t.dueDate) : "",
        repeat: t?.recurrence ? String(t.recurrence) : "",
        cluster: clusterKey,
        section: sectionKey,
        status: "new",
      }))
      .filter((t) => t.title);
  } catch (err) {
    console.warn("[entryAutomation] extractEntrySuggestions failed:", err?.message || err);
    return [];
  }
}

function isGatherOnlyEntry(text = "") {
  try {
    return !hasScheduledActionSignal(text) && (extractGatherItems(text) || []).length > 0;
  } catch {
    return false;
  }
}

function isInterestOnlyEntry(text = "") {
  try {
    return (extractInterests(text) || []).length > 0;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* NLP side effects                                                    */
/* ------------------------------------------------------------------ */

async function upsertImportantEvent({ userId, title, date, details = "", cluster = null, entryId = null }) {
  const cleanedTitle = cleanCalendarTitle(title) || String(title || "").trim();
  if (!userId || !cleanedTitle || !date) return null;
  if (entryId) {
    const linkedDoc = await ImportantEvent.findOne({ userId, date, entryId, source: "entry-automation" });
    if (linkedDoc) return linkedDoc;
  }
  const doc = await ImportantEvent.findOne({ userId, title: cleanedTitle, date });
  if (doc) return doc;
  return ImportantEvent.create({
    userId,
    title: cleanedTitle,
    date,
    description: details || "",
    cluster: cluster || null,
    ...(entryId ? { entryId } : {}),
    source: "entry-automation",
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
  const cleanedTitle = cleanCalendarTitle(title) || String(title || "").trim();
  if (!userId || !cleanedTitle || !date || !timeStart) return null;
  if (entryId) {
    const linkedDoc = await Appointment.findOne({ userId, date, timeStart, entryId, source: "entry-automation" });
    if (linkedDoc) return linkedDoc;
  }
  const existing = await Appointment.findOne({ userId, title: cleanedTitle, date, timeStart });
  if (existing) return existing;
  return Appointment.create({
    userId,
    title: cleanedTitle,
    date,
    timeStart,
    timeEnd: timeEnd || null,
    location: location || "",
    details: details || "",
    ...(cluster ? { cluster } : {}),
    ...(entryId ? { entryId } : {}),
    source: "entry-automation",
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
          entryId: entry._id,
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
            entryId: entry._id,
          });
        }
      }
    }
  } catch (err) {
    console.warn("[entryAutomation] NLP side-effects failed:", err?.message || err);
  }
}

/* ------------------------------------------------------------------ */
/* Ripple generation                                                   */
/* ------------------------------------------------------------------ */

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

function toISODateString(value) {
  if (!value) return "";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return [
    d.getUTCFullYear(),
    String(d.getUTCMonth() + 1).padStart(2, "0"),
    String(d.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function cleanCalendarTitle(value = "") {
  let title = String(value || "")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim();

  title = title
    .replace(/^(?:i|we)\s+(?:have|had|got)\s+(?:a|an|the)?\s*/i, "")
    .replace(/^(?:i|we)['’]ve\s+(?:got\s+)?(?:a|an|the)?\s*/i, "")
    .replace(/^there(?:'|’)?s\s+(?:a|an|the)?\s*/i, "")
    .replace(/^(?:a|an|the)\s+/i, "")
    .replace(/[,:;-]+$/g, "")
    .trim();

  if (!title) return "";
  return title.charAt(0).toUpperCase() + title.slice(1);
}

function parseAppointmentsFromText(text = "", entryDateISO = null) {
  try {
    const raw = String(text || "").trim();
    if (!raw) return { appointments: [], importantEvents: [] };

    const base = entryDateISO ? new Date(`${entryDateISO}T12:00:00`) : new Date();
    const results = chrono.parse(raw, base, { forwardDate: true }) || [];

    const appointments = [];
    const importantEvents = [];

    const eventHint = /(birthday|anniversary|holiday|christmas|easter|thanksgiving|new year)/i;
    const apptHint = /(appointment|dentist|doctor|clinic|meeting|call|pickup|drop[- ]?off|therapy|vet|interview)/i;

    for (const r of results) {
      const date = r.start?.date?.();
      if (!date || Number.isNaN(date.getTime())) continue;
      const dateISO = toISODateString(date);
      if (!dateISO) continue;

      const hasTime = r.start?.isCertain?.("hour") || r.start?.isCertain?.("minute");
      const idx = typeof r.index === "number" ? r.index : raw.toLowerCase().indexOf(String(r.text || "").toLowerCase());
      const titleRaw = idx > 0 ? raw.slice(0, idx).trim() : raw.trim();
      const title = cleanCalendarTitle(titleRaw.replace(/[,:-]+$/g, "").trim()) || cleanCalendarTitle(String(r.text || "").trim());
      if (!title) continue;

      if (hasTime && apptHint.test(raw)) {
        const hh = String(date.getHours()).padStart(2, "0");
        const mm = String(date.getMinutes()).padStart(2, "0");
        appointments.push({ title, date: dateISO, timeStart: `${hh}:${mm}` });
      } else if (eventHint.test(raw)) {
        importantEvents.push({ title, date: dateISO, details: "" });
      }
    }

    return { appointments, importantEvents };
  } catch (err) {
    console.warn("[entryAutomation] parseAppointmentsFromText failed:", err?.message || err);
    return { appointments: [], importantEvents: [] };
  }
}

export async function clearRippleArtifacts({ userId, entryId }) {
  if (!userId || !entryId) return;
  const rippleQuery = Ripple.find({ userId, entryId, status: "pending" });
  const selectedRipples = rippleQuery?.select ? rippleQuery.select("_id") : rippleQuery;
  const rippleIds = selectedRipples?.lean ? await selectedRipples.lean() : await selectedRipples;
  const ids = rippleIds.map((r) => r._id);
  if (ids.length) {
    await SuggestedTask.deleteMany({ userId, sourceRippleId: { $in: ids }, status: "pending" });
  }
  await Ripple.deleteMany({ userId, entryId, status: "pending" });
}

export async function clearPendingGatherSuggestions({ userId, entryId }) {
  if (!userId || !entryId) return;
  await SuggestedGatherItem.deleteMany({ userId, sourceEntryId: entryId, status: "pending" });
}

export async function clearPendingInterestSuggestions({ userId, entryId }) {
  if (!userId || !entryId) return;
  await SuggestedInterest.deleteMany({ userId, sourceEntryId: entryId, status: "pending" });
}

export async function clearAutomationCalendarArtifacts({ userId, entryId }) {
  if (!userId || !entryId) return;
  const query = { userId, entryId, source: "entry-automation" };
  await Promise.all([
    Appointment.deleteMany(query),
    ImportantEvent.deleteMany(query),
  ]);
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

async function findLean(Model, query) {
  const result = Model.find(query);
  if (result?.select) {
    const selected = result.select("title normalizedTitle");
    if (selected?.lean) return selected.lean();
    return selected;
  }
  if (result?.lean) return result.lean();
  return result;
}

async function gatherDuplicateExists({ userId, list, normalizedTitle }) {
  if (!userId || !list || !normalizedTitle) return false;

  const [pendingSuggestions, activeItems] = await Promise.all([
    findLean(SuggestedGatherItem, { userId, list, status: "pending" }),
    findLean(GatherItem, { userId, list, status: { $in: ["needed", "found"] } }),
  ]);

  const existing = [...(pendingSuggestions || []), ...(activeItems || [])];
  return existing.some((item) => {
    const key = item?.normalizedTitle || normalizeGatherTitleKey(item?.title || "");
    return key === normalizedTitle;
  });
}

async function interestDuplicateExists({ userId, category, normalizedTitle }) {
  if (!userId || !category || !normalizedTitle) return false;

  const [pendingSuggestions, activeInterests] = await Promise.all([
    findLean(SuggestedInterest, { userId, category, status: "pending" }),
    findLean(Interest, { userId, category, status: { $in: ["curious", "exploring", "active", "paused"] } }),
  ]);

  const existing = [...(pendingSuggestions || []), ...(activeInterests || [])];
  return existing.some((item) => {
    const key = item?.normalizedTitle || normalizeInterestTitleKey(item?.title || "");
    return key === normalizedTitle;
  });
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

  const suggestionPayloads = rippleDocs
    .map((doc, idx) => {
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
    })
    .filter((p) => p.title);

  await safeInsertMany(SuggestedTask, suggestionPayloads);

  return { ripples: rippleDocs, suggestedTasks: suggestionPayloads };
}

async function generateGatherSuggestions({ entry, text, userId }) {
  const basis = String(text || entry?.text || entry?.content || "").trim();
  if (!basis || !entry?._id || !userId) return [];

  let extracted = [];
  try {
    extracted = extractGatherItems(basis) || [];
  } catch (err) {
    console.warn("[entryAutomation] extractGatherItems failed:", err?.message || err);
    return [];
  }

  if (!Array.isArray(extracted) || !extracted.length) return [];

  let clusters = Array.isArray(entry?.clusters) ? normalizeClusterIds(entry.clusters) : [];
  if (!clusters.length && entry?.cluster) {
    const resolvedCluster = await resolveClusterIdForOwner(userId, entry.cluster);
    if (resolvedCluster) clusters = [resolvedCluster];
  }
  const docs = extracted
    .slice(0, 25)
    .map((item) => ({
      userId,
      title: String(item?.title || "").trim(),
      description: typeof item?.description === "string" ? item.description.trim() : "",
      clusters,
      list: String(item?.list || "Things to Buy").trim() || "Things to Buy",
      status: "pending",
      sourceEntryId: entry._id,
      sourceText: String(item?.sourceText || basis).trim(),
      confidence: Number.isFinite(Number(item?.confidence)) ? Number(item.confidence) : 0.7,
      reason: String(item?.reason || "needPhrase"),
      tags: Array.isArray(item?.tags) ? item.tags.filter((tag) => typeof tag === "string" && tag.trim()) : [],
    }))
    .filter((item) => item.title);

  const dedupedDocs = [];
  const seen = new Set();

  for (const doc of docs) {
    const normalizedTitle = normalizeGatherTitleKey(doc.title);
    const list = String(doc.list || "").trim();
    if (!normalizedTitle || !list) continue;

    const key = `${list.toLowerCase()}|${normalizedTitle}`;
    if (seen.has(key)) continue;
    seen.add(key);

    if (await gatherDuplicateExists({ userId, list, normalizedTitle })) continue;
    dedupedDocs.push({ ...doc, normalizedTitle });
  }

  return safeInsertMany(SuggestedGatherItem, dedupedDocs);
}

async function generateInterestSuggestions({ entry, text, userId }) {
  const basis = String(text || entry?.text || entry?.content || "").trim();
  if (!basis || !entry?._id || !userId) return [];

  let extracted = [];
  try {
    extracted = extractInterests(basis) || [];
  } catch (err) {
    console.warn("[entryAutomation] extractInterests failed:", err?.message || err);
    return [];
  }

  if (!Array.isArray(extracted) || !extracted.length) return [];

  let clusters = Array.isArray(entry?.clusters) ? normalizeClusterIds(entry.clusters) : [];
  if (!clusters.length && entry?.cluster) {
    const resolvedCluster = await resolveClusterIdForOwner(userId, entry.cluster);
    if (resolvedCluster) clusters = [resolvedCluster];
  }

  const docs = extracted
    .slice(0, 25)
    .map((item) => ({
      userId,
      title: String(item?.title || "").trim(),
      description: typeof item?.description === "string" ? item.description.trim() : "",
      category: String(item?.category || "Learning Curiosities").trim() || "Learning Curiosities",
      status: "pending",
      sourceEntryId: entry._id,
      sourceText: String(item?.sourceText || basis).trim(),
      clusters,
      cluster: entry?.cluster || "",
      confidence: Number.isFinite(Number(item?.confidence)) ? Number(item.confidence) : 0.7,
      reason: String(item?.reason || "interestPhrase"),
      tags: Array.isArray(item?.tags) ? item.tags.filter((tag) => typeof tag === "string" && tag.trim()) : [],
    }))
    .filter((item) => item.title);

  const dedupedDocs = [];
  const seen = new Set();

  for (const doc of docs) {
    const normalizedTitle = normalizeInterestTitleKey(doc.title);
    const category = String(doc.category || "").trim();
    if (!normalizedTitle || !category) continue;

    const key = `${category.toLowerCase()}|${normalizedTitle}`;
    if (seen.has(key)) continue;
    seen.add(key);

    if (await interestDuplicateExists({ userId, category, normalizedTitle })) continue;
    dedupedDocs.push({ ...doc, normalizedTitle });
  }

  return safeInsertMany(SuggestedInterest, dedupedDocs);
}

/* ------------------------------------------------------------------ */
/* Entry normalization                                                 */
/* ------------------------------------------------------------------ */

function normalizeEntryForCreate(payload = {}) {
  const normalized = normalizeEntryForUpdate(payload, {});
  if (!("date" in normalized)) normalized.date = normalizeDate(payload.date);
  if (!("text" in normalized)) {
    const text = plainTextFrom({ text: payload.text, html: payload.html, content: payload.content });
    normalized.text = text;
    normalized.html = typeof payload.html === "string" ? payload.html : "";
    normalized.content = typeof payload.content === "string" ? payload.content : normalized.html;
  } else {
    if (!("html" in normalized)) {
      normalized.html = typeof payload.html === "string" ? payload.html : "";
    }
    if (!("content" in normalized)) {
      normalized.content = typeof payload.content === "string" ? payload.content : normalized.html;
    }
  }
  if (!("mood" in normalized)) normalized.mood = typeof payload.mood === "string" ? payload.mood : "";
  if (!("cluster" in normalized)) normalized.cluster = typeof payload.cluster === "string" ? payload.cluster : "";
  if (!("clusters" in normalized)) normalized.clusters = normalizeClusterIds(payload.clusters);
  if (!("section" in normalized)) normalized.section = typeof payload.section === "string" ? payload.section : "";
  if (!("sectionId" in normalized)) normalized.sectionId = toObjectIdOrNull(payload.sectionId);
  if (!("tags" in normalized)) normalized.tags = deDupeTags(payload.tags);
  if (!("linkedGoal" in normalized)) normalized.linkedGoal = toObjectIdOrNull(payload.linkedGoal);
  if (!("sectionPageId" in normalized)) normalized.sectionPageId = toObjectIdOrNull(payload.sectionPageId);
  if (!("pinned" in normalized)) normalized.pinned = !!payload.pinned;
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

    const nextHtml = Object.prototype.hasOwnProperty.call(payload, "html") ? payload.html : existing.html;
    const nextContent = Object.prototype.hasOwnProperty.call(payload, "content") ? payload.content : existing.content;
    normalized.html = typeof nextHtml === "string" ? nextHtml : "";
    normalized.content = typeof nextContent === "string" ? nextContent : normalized.html;
  }

  if (Object.prototype.hasOwnProperty.call(payload, "mood")) {
    normalized.mood = typeof payload.mood === "string" ? payload.mood : "";
  }
  if (Object.prototype.hasOwnProperty.call(payload, "cluster")) {
    normalized.cluster = typeof payload.cluster === "string" ? payload.cluster : "";
  }
  if (Object.prototype.hasOwnProperty.call(payload, "clusters")) {
    normalized.clusters = normalizeClusterIds(payload.clusters);
  }
  if (Object.prototype.hasOwnProperty.call(payload, "section")) {
    normalized.section = typeof payload.section === "string" ? payload.section : "";
  }
  if (Object.prototype.hasOwnProperty.call(payload, "sectionId")) {
    normalized.sectionId = toObjectIdOrNull(payload.sectionId);
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
  if (Object.prototype.hasOwnProperty.call(payload, "pinned")) {
    normalized.pinned = !!payload.pinned;
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

  const gatherOnlyEntry = isGatherOnlyEntry(normalized.text);
  const interestOnlyEntry = isInterestOnlyEntry(normalized.text);
  const suggestedTasks = gatherOnlyEntry || interestOnlyEntry
    ? []
    : buildSuggestedTasks({
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
    clusters: normalized.clusters,
    section: normalized.section,
    sectionId: normalized.sectionId,
    pinned: normalized.pinned,
    tags: mergedTags,
    linkedGoal: normalized.linkedGoal,
    sectionPageId: normalized.sectionPageId,
    suggestedTasks,
  });

  try {
    const textForMatch = String(entry?.text || "").toLowerCase();
    if (textForMatch) {
      const ownedClusters = await Cluster.find({ ownerId: userId }).select("_id name").lean();
      const current = new Set((entry.clusters || []).map((id) => String(id)));
      let changed = false;

      for (const cluster of ownedClusters || []) {
        const name = String(cluster?.name || "").trim().toLowerCase();
        const id = cluster?._id ? String(cluster._id) : "";
        if (!name || !id) continue;
        if (!textForMatch.includes(name)) continue;
        if (current.has(id)) continue;
        entry.clusters.push(cluster._id);
        current.add(id);
        changed = true;
      }

      if (changed) await entry.save();
    }
  } catch (err) {
    console.warn("[entryAutomation] cluster auto-assign failed:", err?.message || err);
  }

  await runNlpSideEffects({ entry, analysis, userId });

  try {
    const parsed = parseAppointmentsFromText(entry?.text || "", entry?.date);

    if (Array.isArray(parsed?.appointments)) {
      for (const ap of parsed.appointments) {
        const timeStart = normalizeHHMM(ap.timeStart);
        if (!timeStart) continue;
        await upsertAppointment({
          userId,
          title: ap.title,
          date: normalizeDate(ap.date),
          timeStart,
          cluster: entry.cluster || null,
          entryId: entry._id,
        });
      }
    }

    if (Array.isArray(parsed?.importantEvents)) {
      for (const ev of parsed.importantEvents) {
        await upsertImportantEvent({
          userId,
          title: ev.title,
          date: normalizeDate(ev.date),
          details: ev.details || "",
          cluster: entry.cluster || null,
          entryId: entry._id,
        });
      }
    }
  } catch (err) {
    console.warn("[entryAutomation] parsed appointment/event side-effects failed:", err?.message || err);
  }

  if (!gatherOnlyEntry && !interestOnlyEntry) {
    await generateRipplesAndSuggestions({ entry, text: normalized.text, userId });
  }
  await generateGatherSuggestions({ entry, text: normalized.text, userId });
  await generateInterestSuggestions({ entry, text: normalized.text, userId });

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
  if (Object.prototype.hasOwnProperty.call(normalized, "clusters")) {
    entry.clusters = normalizeClusterIds(normalized.clusters);
  }
  if (Object.prototype.hasOwnProperty.call(normalized, "section")) {
    entry.section = normalized.section || "";
  }
  if (Object.prototype.hasOwnProperty.call(normalized, "sectionId")) {
    entry.sectionId = normalized.sectionId;
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
  if (Object.prototype.hasOwnProperty.call(normalized, "pinned")) {
    entry.pinned = !!normalized.pinned;
  }

  let analysis = null;
  if (coreChanged) {
    analysis = analyzeEntrySafe({ text: entry.text, html: entry.html, date: entry.date });
    entry.tags = deDupeTags([...(entry.tags || []), ...((analysis?.tags || []))]);
    entry.suggestedTasks = (isGatherOnlyEntry(entry.text) || isInterestOnlyEntry(entry.text))
      ? []
      : buildSuggestedTasks({
          text: entry.text,
          date: entry.date,
          cluster: entry.cluster,
          section: entry.section,
        });
  }

  const updated = await entry.save();

  if (coreChanged) {
    await clearAutomationCalendarArtifacts({ userId, entryId: updated._id });
    await runNlpSideEffects({ entry: updated, analysis, userId });
  }

  await clearRippleArtifacts({ userId, entryId: updated._id });
  const updatedGatherOnly = isGatherOnlyEntry(updated.text);
  const updatedInterestOnly = isInterestOnlyEntry(updated.text);
  if (!updatedGatherOnly && !updatedInterestOnly) {
    await generateRipplesAndSuggestions({ entry: updated, text: updated.text, userId });
  }
  await clearPendingGatherSuggestions({ userId, entryId: updated._id });
  await generateGatherSuggestions({ entry: updated, text: updated.text, userId });
  await clearPendingInterestSuggestions({ userId, entryId: updated._id });
  await generateInterestSuggestions({ entry: updated, text: updated.text, userId });

  return updated;
}

/* ------------------------------------------------------------------ */
/* Test-only exports                                                   */
/* ------------------------------------------------------------------ */

export const __testables = {
  buildSuggestedTasks,
  normalizeOptionalString,
};

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
  clearPendingGatherSuggestions,
  clearPendingInterestSuggestions,
  clearAutomationCalendarArtifacts,
};
