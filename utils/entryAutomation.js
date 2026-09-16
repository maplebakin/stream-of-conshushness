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
import SuggestedSchedule from "../models/SuggestedSchedule.js";
import Cluster from "../models/Cluster.js";
import { normalizeClusterIds, resolveClusterIdForOwner } from "./clusterIds.js";

import * as chrono from "chrono-node";
import analyzeEntry from "./analyzeEntry.js";
import { extractEntrySuggestions, extractRipplesFromEntry } from "./rippleExtractor.js";
import { sieveRipples } from "./rippleSieve.js";
import { extractGatherItems, hasScheduledActionSignal, normalizeGatherTitleKey } from "./gatherExtractor.js";
import { extractInterests, normalizeInterestTitleKey } from "./interestExtractor.js";
import { todayISOInTZ, normalizeDate } from "./date.js";
import { logSafeError } from "./errorHandler.js";
import { addScheduleDays, parseWorkSchedule, reconcileWorkSchedule } from "./workSchedule.js";
import {
  resolveOwnedGoalId,
  resolveOwnedSectionId,
  resolveOwnedSectionPageId,
} from "./ownedReferences.js";

const { ObjectId } = mongoose.Types;

export function normalizeHHMM(v) {
  if (!v && v !== 0) return null;
  const match = String(v).trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
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

class EntryInputError extends Error {
  constructor(message) {
    super(message);
    this.name = "EntryInputError";
    this.statusCode = 400;
  }
}

function hasReferenceValue(value) {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

async function resolveOwnedReferenceOrThrow({ userId, value, resolver, field, resource }) {
  if (!hasReferenceValue(value)) return null;
  const resolved = await resolver(userId, value);
  if (!resolved) {
    throw new EntryInputError(`${field} must reference one of your ${resource}`);
  }
  return resolved;
}

async function resolveOwnedClusterInputsOrThrow(userId, raw) {
  const values = Array.isArray(raw) ? raw : (raw == null || raw === "" ? [] : [raw]);
  const resolved = [];
  const seen = new Set();
  for (const value of values) {
    if (!hasReferenceValue(value)) continue;
    const clusterId = await resolveClusterIdForOwner(userId, value);
    if (!clusterId) {
      throw new EntryInputError("clusters must reference only your clusters");
    }
    const key = String(clusterId);
    if (!seen.has(key)) {
      seen.add(key);
      resolved.push(clusterId);
    }
  }
  return resolved;
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

function containsClusterPhrase(text, name) {
  const phrase = String(name || '').trim().toLowerCase();
  if (phrase.length < 3) return false;
  const escaped = phrase
    .split(/\s+/)
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('\\s+');
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, 'iu').test(text);
}

function analyzeEntrySafe({ text, html, date }) {
  try {
    const baseDate = date ? new Date(`${date}T12:00:00`) : undefined;
    return analyzeEntry({ text, html, baseDate }) || null;
  } catch (err) {
    logSafeError('entry automation analyzeEntry failed', err);
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
    logSafeError('entry automation task extraction failed', err);
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

function isInterestOnlyEntry(text = "", taskSuggestions = []) {
  try {
    return (extractInterests(text) || []).length > 0 && taskSuggestions.length === 0;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* NLP side effects                                                    */
/* ------------------------------------------------------------------ */

function automationRevisionOf(entry) {
  const value = Number(entry?.automationRevision);
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function revisionScope({ beforeRevision, exactRevision } = {}) {
  if (Number.isSafeInteger(exactRevision) && exactRevision >= 0) {
    return { automationRevision: exactRevision };
  }
  if (Number.isSafeInteger(beforeRevision) && beforeRevision > 0) {
    return {
      $or: [
        { automationRevision: { $exists: false } },
        { automationRevision: { $lt: beforeRevision } },
      ],
    };
  }
  return {};
}

function calendarDecisionTitleKey(value) {
  return cleanCalendarTitle(value)
    .toLowerCase()
    .replace(/\b(?:(?:is|at|on)\s*)+$/i, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

async function upsertImportantEvent({ userId, title, date, details = "", cluster = null, entryId = null, automationRevision = 0 }) {
  const cleanedTitle = cleanCalendarTitle(title) || String(title || "").trim();
  if (!userId || !cleanedTitle || !date) return null;
  if (entryId) {
    const linkedDoc = await ImportantEvent.findOne({
      userId,
      title: cleanedTitle,
      date,
      entryId,
      source: "entry-automation",
      $or: [
        { automationReviewStatus: { $in: ["kept", "dismissed"] } },
        { automationReviewStatus: "pending", automationRevision },
      ],
    });
    if (linkedDoc) return linkedDoc;
    const linkedDecision = await ImportantEvent.findOne({
      userId,
      date,
      entryId,
      source: "entry-automation",
      automationReviewStatus: { $in: ["kept", "dismissed"] },
    });
    if (
      linkedDecision &&
      calendarDecisionTitleKey(linkedDecision.title) === calendarDecisionTitleKey(cleanedTitle)
    ) return linkedDecision;
    const linkedVisibleDoc = await ImportantEvent.findOne({
      userId,
      date,
      entryId,
      source: "entry-automation",
      automationReviewStatus: "pending",
      automationRevision,
    });
    if (linkedVisibleDoc) return linkedVisibleDoc;
  }
  const doc = await ImportantEvent.findOne({
    userId,
    title: cleanedTitle,
    date,
    $or: [
      { source: { $ne: "entry-automation" } },
      { source: "entry-automation", automationReviewStatus: "kept" },
      { source: "entry-automation", automationReviewStatus: "pending", automationRevision },
    ],
  });
  if (doc) return doc;
  return ImportantEvent.create({
    userId,
    title: cleanedTitle,
    date,
    description: details || "",
    cluster: cluster || null,
    ...(entryId ? { entryId } : {}),
    source: "entry-automation",
    automationReviewStatus: "pending",
    automationRevision,
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
  automationRevision = 0,
}) {
  const cleanedTitle = cleanCalendarTitle(title) || String(title || "").trim();
  if (!userId || !cleanedTitle || !date || !timeStart) return null;
  if (entryId) {
    const linkedDoc = await Appointment.findOne({
      userId,
      title: cleanedTitle,
      date,
      timeStart,
      entryId,
      source: "entry-automation",
      $or: [
        { automationReviewStatus: { $in: ["kept", "dismissed"] } },
        { automationReviewStatus: "pending", automationRevision },
      ],
    });
    if (linkedDoc) return linkedDoc;
    const linkedDecision = await Appointment.findOne({
      userId,
      date,
      timeStart,
      entryId,
      source: "entry-automation",
      automationReviewStatus: { $in: ["kept", "dismissed"] },
    });
    if (
      linkedDecision &&
      calendarDecisionTitleKey(linkedDecision.title) === calendarDecisionTitleKey(cleanedTitle)
    ) return linkedDecision;
    const linkedVisibleDoc = await Appointment.findOne({
      userId,
      date,
      timeStart,
      entryId,
      source: "entry-automation",
      automationReviewStatus: "pending",
      automationRevision,
    });
    if (linkedVisibleDoc) return linkedVisibleDoc;
  }
  const existing = await Appointment.findOne({
    userId,
    title: cleanedTitle,
    date,
    timeStart,
    $or: [
      { source: { $ne: "entry-automation" } },
      { source: "entry-automation", automationReviewStatus: "kept" },
      { source: "entry-automation", automationReviewStatus: "pending", automationRevision },
    ],
  });
  if (existing) return existing;
  const payload = {
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
    automationReviewStatus: "pending",
    automationRevision,
    createdAt: new Date(),
  };
  try {
    return await Appointment.create(payload);
  } catch (error) {
    // The appointment uniqueness index can race a stale automation writer.
    // Atomically take over only an untouched pending artifact from this same
    // source entry; manual, kept, dismissed, and user-edited records remain
    // authoritative.
    if (error?.code !== 11000 || !entryId || typeof Appointment.findOneAndUpdate !== "function") {
      throw error;
    }
    const reclaimed = await Appointment.findOneAndUpdate(
      {
        userId,
        title: cleanedTitle,
        date,
        timeStart,
        entryId,
        source: "entry-automation",
        automationReviewStatus: "pending",
        automationRevision: { $lt: automationRevision },
      },
      { $set: payload },
      { new: true, runValidators: true }
    );
    if (reclaimed) return reclaimed;
    throw error;
  }
}

async function runNlpSideEffects({ entry, analysis, userId }) {
  if (!analysis) return;
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
        automationRevision: automationRevisionOf(entry),
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
          automationRevision: automationRevisionOf(entry),
        });
      } else {
        await upsertImportantEvent({
          userId,
          title,
          date: dateISO,
          details: ap?.details || ap?.notes || "",
          cluster: entry.cluster || null,
          entryId: entry._id,
          automationRevision: automationRevisionOf(entry),
        });
      }
    }
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
    .replace(/^(?:i|we)\s+(?:am|are)['’]?\s+going\s+to\s+/i, "")
    .replace(/^(?:i|we)['’]?m\s+going\s+to\s+/i, "")
    .replace(/^(?:i|we)\s+(?:plan|planned)\s+to\s+/i, "")
    .replace(/^(?:i|we)['’]?m\s+planning\s+to\s+/i, "")
    .replace(/^(?:i|we)\s+(?:have|had|got)\s+(?:a|an|the)?\s*/i, "")
    .replace(/^(?:i|we)['’]ve\s+(?:got\s+)?(?:a|an|the)?\s*/i, "")
    .replace(/^there(?:'|’)?s\s+(?:a|an|the)?\s*/i, "")
    .replace(/^(?:a|an|the)\s+/i, "")
    .replace(/[,:;-]+$/g, "")
    .trim();

  if (!title) return "";
  return title.charAt(0).toUpperCase() + title.slice(1);
}

function daysInMonth(year, monthIndex) {
  return new Date(Date.UTC(year, monthIndex + 1, 0, 12)).getUTCDate();
}

function resolveOrdinalDayDate(day, entryDateISO = null) {
  const ordinalDay = Number(day);
  if (!Number.isInteger(ordinalDay) || ordinalDay < 1 || ordinalDay > 31) return "";

  const base = entryDateISO && /^\d{4}-\d{2}-\d{2}$/.test(String(entryDateISO))
    ? new Date(`${entryDateISO}T12:00:00Z`)
    : new Date();
  if (Number.isNaN(base.getTime())) return "";

  let year = base.getUTCFullYear();
  let month = base.getUTCMonth();
  const baseDay = base.getUTCDate();

  if (ordinalDay < baseDay || ordinalDay > daysInMonth(year, month)) {
    for (let offset = 1; offset <= 12; offset += 1) {
      const candidateMonth = month + offset;
      const candidateYear = year + Math.floor(candidateMonth / 12);
      const normalizedMonth = candidateMonth % 12;
      if (ordinalDay <= daysInMonth(candidateYear, normalizedMonth)) {
        year = candidateYear;
        month = normalizedMonth;
        break;
      }
    }
  }

  if (ordinalDay > daysInMonth(year, month)) return "";
  return [
    year,
    String(month + 1).padStart(2, "0"),
    String(ordinalDay).padStart(2, "0"),
  ].join("-");
}

function parseOrdinalDayHits(raw = "", entryDateISO = null) {
  const hits = [];
  const re = /\bon\s+(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)\b/gi;
  let match;
  while ((match = re.exec(raw))) {
    const dateISO = resolveOrdinalDayDate(match[1], entryDateISO);
    if (!dateISO) continue;
    hits.push({
      text: match[0],
      index: match.index,
      dateISO,
      hasTime: false,
    });
  }
  return hits;
}

function isPersonalPlanText(text = "") {
  const source = String(text || "").toLowerCase();
  if (!source) return false;
  return /\b(?:i|we)(?:'m|'re| am| are)?\s+(?:going|planning)\s+to\b/.test(source) ||
    /\b(?:i|we)\s+(?:plan|planned)\s+to\b/.test(source) ||
    /\b(?:visit|visiting|see|meet|meeting|go to|go over to|come over|dinner|lunch|brunch)\b/.test(source);
}

function shouldCreateDateOnlyEvent(raw = "") {
  const eventHint = /(birthday|anniversary|holiday|christmas|easter|thanksgiving|new year)/i;
  return eventHint.test(raw) || isPersonalPlanText(raw);
}

function parseAppointmentsFromText(text = "", entryDateISO = null) {
  try {
    const raw = String(text || "").trim();
    if (!raw) return { appointments: [], importantEvents: [] };

    const base = entryDateISO ? new Date(`${entryDateISO}T12:00:00`) : new Date();
    const results = chrono.parse(raw, base, { forwardDate: true }) || [];

    const appointments = [];
    const importantEvents = [];

    const apptHint = /(appointment|dentist|doctor|clinic|meeting|call|pickup|drop[- ]?off|therapy|vet|interview)/i;
    const parsedHits = [
      ...results.map((r) => {
        const date = r.start?.date?.();
        if (!date || Number.isNaN(date.getTime())) return null;
        return {
          text: String(r.text || ""),
          index: typeof r.index === "number" ? r.index : raw.toLowerCase().indexOf(String(r.text || "").toLowerCase()),
          dateISO: toISODateString(date),
          hasTime: r.start?.isCertain?.("hour") || r.start?.isCertain?.("minute"),
          date,
        };
      }).filter(Boolean),
      ...parseOrdinalDayHits(raw, entryDateISO),
    ];

    const seenHits = new Set();
    for (const hit of parsedHits) {
      const dateISO = hit.dateISO;
      if (!dateISO) continue;
      const hitKey = `${hit.index}|${hit.text}|${dateISO}|${hit.hasTime ? "time" : "day"}`;
      if (seenHits.has(hitKey)) continue;
      seenHits.add(hitKey);

      const hasTime = !!hit.hasTime;
      const idx = hit.index;
      const titleRaw = idx > 0 ? raw.slice(0, idx).trim() : raw.trim();
      const title = cleanCalendarTitle(titleRaw.replace(/[,:-]+$/g, "").trim()) || cleanCalendarTitle(String(hit.text || "").trim());
      if (!title) continue;

      if (hasTime && apptHint.test(raw)) {
        const hh = String(hit.date.getHours()).padStart(2, "0");
        const mm = String(hit.date.getMinutes()).padStart(2, "0");
        appointments.push({ title, date: dateISO, timeStart: `${hh}:${mm}` });
      } else if (shouldCreateDateOnlyEvent(raw)) {
        importantEvents.push({ title, date: dateISO, details: "" });
      }
    }

    return { appointments, importantEvents };
  } catch (err) {
    logSafeError('entry automation calendar parse failed', err);
    return { appointments: [], importantEvents: [] };
  }
}

async function runParsedCalendarSideEffects({ entry, userId }) {
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
        automationRevision: automationRevisionOf(entry),
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
        automationRevision: automationRevisionOf(entry),
      });
    }
  }
}

async function generateScheduleSuggestion({ entry, userId, parsed = null }) {
  const schedule = parsed || parseWorkSchedule(entry?.text || "", entry?.date);
  if (!schedule) return null;

  const bounds = [entry.date, schedule.periodStart, schedule.periodEnd].filter(Boolean).sort();
  const queryStart = addScheduleDays(bounds[0], -14);
  const queryEnd = addScheduleDays(bounds.at(-1), 42);
  const priorAppointments = await Appointment.find({
    userId,
    scheduleLabel: schedule.label,
    scheduleStatus: { $ne: "cancelled" },
    date: { $gte: queryStart, $lte: queryEnd },
  }).sort({ date: 1, timeStart: 1 }).lean();

  const changes = reconcileWorkSchedule(schedule, priorAppointments);
  if (!changes.length) return null;

  const existingGroupId = priorAppointments
    .map((item) => String(item.scheduleGroupId || "").trim())
    .find(Boolean);
  const scheduleGroupId = existingGroupId
    || `${schedule.label.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-")}:${schedule.periodStart}:${schedule.periodEnd}`;
  const payload = {
    userId,
    sourceEntryId: entry._id,
    automationRevision: automationRevisionOf(entry),
    scheduleGroupId,
    label: schedule.label,
    mode: schedule.mode,
    periodStart: schedule.periodStart,
    periodEnd: schedule.periodEnd,
    sourceText: schedule.sourceText,
    changes,
    status: "pending",
  };

  try {
    return await SuggestedSchedule.create(payload);
  } catch (error) {
    if (error?.code !== 11000) throw error;
    return SuggestedSchedule.findOne({
      userId,
      sourceEntryId: entry._id,
      automationRevision: automationRevisionOf(entry),
    });
  }
}

export async function clearRippleArtifacts({ userId, entryId, beforeRevision, exactRevision } = {}) {
  if (!userId || !entryId) return;
  const scope = revisionScope({ beforeRevision, exactRevision });
  const rippleQuery = Ripple.find({ userId, entryId, status: "pending", ...scope });
  const selectedRipples = rippleQuery?.select ? rippleQuery.select("_id") : rippleQuery;
  const rippleIds = selectedRipples?.lean ? await selectedRipples.lean() : await selectedRipples;
  const ids = rippleIds.map((r) => r._id);
  await SuggestedTask.deleteMany({
    userId,
    status: "pending",
    $or: [
      { sourceEntryId: entryId, ...scope },
      ...(ids.length ? [{ sourceRippleId: { $in: ids } }] : []),
    ],
  });
  // An acceptance/rejection claim may have won after the pending ripple list
  // was read. Preserve every ripple referenced by a non-pending suggestion so
  // source provenance and the user's decision cannot be orphaned by cleanup.
  let deletableIds = ids;
  if (ids.length) {
    const protectedQuery = typeof SuggestedTask.find === "function"
      ? SuggestedTask.find({
        userId,
        sourceRippleId: { $in: ids },
        status: { $in: ["accepting", "rejecting", "accepted", "rejected", "superseded"] },
      })
      : [];
    const selectedProtected = protectedQuery?.select
      ? protectedQuery.select("sourceRippleId")
      : protectedQuery;
    const protectedResult = selectedProtected?.lean
      ? await selectedProtected.lean()
      : await selectedProtected;
    const protectedRows = Array.isArray(protectedResult) ? protectedResult : [];
    const protectedIds = new Set(
      (protectedRows || []).map((row) => String(row?.sourceRippleId || "")).filter(Boolean)
    );
    deletableIds = ids.filter((id) => !protectedIds.has(String(id)));
  }
  if (deletableIds.length) {
    await Ripple.deleteMany({
      userId,
      entryId,
      status: "pending",
      _id: { $in: deletableIds },
      ...scope,
    });
  }
}

async function finalRippleDecisionKeys({ userId, entryId }) {
  if (!userId || !entryId) return new Set();
  const query = Ripple.find({
    userId,
    entryId,
    status: { $in: ["approved", "dismissed", "applied"] },
  });
  const selected = query?.select ? query.select("text") : query;
  const rows = selected?.lean ? await selected.lean() : await selected;
  const suggestionQuery = typeof SuggestedTask.find === "function"
    ? SuggestedTask.find({
      userId,
      sourceEntryId: entryId,
      status: { $in: ["rejected", "superseded"] },
    })
    : [];
  const selectedSuggestions = suggestionQuery?.select ? suggestionQuery.select("title") : suggestionQuery;
  const suggestionResult = selectedSuggestions?.lean
    ? await selectedSuggestions.lean()
    : await selectedSuggestions;
  const suggestions = Array.isArray(suggestionResult) ? suggestionResult : [];
  return new Set([
    ...(rows || []).map((row) => String(row?.text || "").trim().toLowerCase()),
    ...(suggestions || []).map((row) => String(row?.title || "").trim().toLowerCase()),
  ].filter(Boolean));
}

export async function clearPendingGatherSuggestions({ userId, entryId, beforeRevision, exactRevision } = {}) {
  if (!userId || !entryId) return;
  await SuggestedGatherItem.deleteMany({
    userId,
    sourceEntryId: entryId,
    status: "pending",
    ...revisionScope({ beforeRevision, exactRevision }),
  });
}

export async function clearPendingInterestSuggestions({ userId, entryId, beforeRevision, exactRevision } = {}) {
  if (!userId || !entryId) return;
  await SuggestedInterest.deleteMany({
    userId,
    sourceEntryId: entryId,
    status: "pending",
    ...revisionScope({ beforeRevision, exactRevision }),
  });
}

export async function clearAutomationCalendarArtifacts({ userId, entryId, beforeRevision, exactRevision } = {}) {
  if (!userId || !entryId) return;
  // Only untouched pending output is replaceable. Kept records are accepted
  // user decisions, dismissed records are decision tombstones, and legacy
  // records without an explicit review state are preserved for compatibility.
  const query = {
    userId,
    entryId,
    source: "entry-automation",
    automationReviewStatus: "pending",
    ...revisionScope({ beforeRevision, exactRevision }),
  };
  await Promise.all([
    Appointment.deleteMany(query),
    ImportantEvent.deleteMany(query),
  ]);
}

export async function clearPendingScheduleSuggestions({ userId, entryId, beforeRevision, exactRevision } = {}) {
  if (!userId || !entryId) return;
  await SuggestedSchedule.deleteMany({
    userId,
    sourceEntryId: entryId,
    status: "pending",
    ...revisionScope({ beforeRevision, exactRevision }),
  });
}

async function clearExactAutomationRevision({ userId, entryId, automationRevision }) {
  if (!Number.isSafeInteger(automationRevision) || automationRevision < 0) return;
  await Promise.all([
    clearRippleArtifacts({ userId, entryId, exactRevision: automationRevision }),
    clearPendingGatherSuggestions({ userId, entryId, exactRevision: automationRevision }),
    clearPendingInterestSuggestions({ userId, entryId, exactRevision: automationRevision }),
    clearAutomationCalendarArtifacts({ userId, entryId, exactRevision: automationRevision }),
  ]);
}

async function currentOwnedEntry({ userId, entryId }) {
  return Entry.findOne({ _id: entryId, userId });
}

async function finalizeAutomationRevision({ entry, userId, automationRevision }) {
  const entryId = entry?._id;
  if (!entryId) return entry;

  // Keep a lightweight fallback for isolated unit doubles. Production always
  // uses the guarded atomic update exposed by Mongoose.
  if (typeof Entry.findOneAndUpdate !== "function") {
    entry.automationPending = false;
    await entry.save();
    return entry;
  }

  const finalized = await Entry.findOneAndUpdate(
    { _id: entryId, userId, automationRevision },
    { $set: { automationPending: false } },
    { new: true, runValidators: true }
  );
  if (finalized) return finalized;

  // A newer source edit superseded this run. Remove only output stamped with
  // this stale revision, then return the current entry rather than presenting
  // stale content as saved.
  await clearExactAutomationRevision({ userId, entryId, automationRevision });
  return (await currentOwnedEntry({ userId, entryId })) || entry;
}

async function recoverSupersededAutomationError({ error, userId, entryId, automationRevision }) {
  const current = await currentOwnedEntry({ userId, entryId });
  if (!current || automationRevisionOf(current) === automationRevision) throw error;
  await clearExactAutomationRevision({ userId, entryId, automationRevision });
  return current;
}

async function safeInsertMany(Model, docs) {
  if (!Array.isArray(docs) || docs.length === 0) return [];
  try {
    return await Model.insertMany(docs, { ordered: false });
  } catch (err) {
    logSafeError(`entry automation ${Model.modelName} insertMany partially failed`, err);
    // Keep the entry's automationPending flag true. A partial batch is not a
    // successful run; the next controlled retry can clear pending artifacts
    // for this source and regenerate them coherently.
    throw err;
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

async function gatherDuplicateExists({ userId, sourceEntryId, automationRevision = 0, list, normalizedTitle }) {
  if (!userId || !list || !normalizedTitle) return false;

  const [pendingSuggestions, finalSourceDecisions, activeItems] = await Promise.all([
    findLean(SuggestedGatherItem, {
      userId,
      list,
      status: "pending",
      ...(sourceEntryId ? {
        $or: [
          { sourceEntryId: { $ne: sourceEntryId } },
          { sourceEntryId, automationRevision },
        ],
      } : {}),
    }),
    sourceEntryId
      ? findLean(SuggestedGatherItem, {
          userId,
          sourceEntryId,
          status: { $in: ["accepted", "rejected"] },
        })
      : [],
    findLean(GatherItem, { userId, list, status: { $in: ["needed", "found"] } }),
  ]);

  const existing = [
    ...(pendingSuggestions || []),
    ...(finalSourceDecisions || []),
    ...(activeItems || []),
  ];
  return existing.some((item) => {
    const key = item?.normalizedTitle || normalizeGatherTitleKey(item?.title || "");
    return key === normalizedTitle;
  });
}

async function interestDuplicateExists({ userId, sourceEntryId, automationRevision = 0, category, normalizedTitle }) {
  if (!userId || !category || !normalizedTitle) return false;

  const [pendingSuggestions, finalSourceDecisions, activeInterests] = await Promise.all([
    findLean(SuggestedInterest, {
      userId,
      category,
      status: "pending",
      ...(sourceEntryId ? {
        $or: [
          { sourceEntryId: { $ne: sourceEntryId } },
          { sourceEntryId, automationRevision },
        ],
      } : {}),
    }),
    sourceEntryId
      ? findLean(SuggestedInterest, {
          userId,
          sourceEntryId,
          status: { $in: ["accepted", "rejected"] },
        })
      : [],
    findLean(Interest, { userId, category, status: { $in: ["curious", "exploring", "active", "paused"] } }),
  ]);

  const existing = [
    ...(pendingSuggestions || []),
    ...(finalSourceDecisions || []),
    ...(activeInterests || []),
  ];
  return existing.some((item) => {
    const key = item?.normalizedTitle || normalizeInterestTitleKey(item?.title || "");
    return key === normalizedTitle;
  });
}

async function generateRipplesAndSuggestions({ entry, text, userId, excludedTextKeys = new Set() }) {
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
    logSafeError('entry automation ripple extraction failed', err);
  }

  const filtered = sieveRipples(extracted);
  const deduped = dedupeRipplesByText(filtered).filter(
    (ripple) => !excludedTextKeys.has(String(ripple.text || '').trim().toLowerCase())
  );
  if (!deduped.length) return { ripples: [], suggestedTasks: [] };

  const rippleDocs = await safeInsertMany(
    Ripple,
    deduped.map((r) => ({
      userId,
      entryId: entry._id,
      automationRevision: automationRevisionOf(entry),
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
      const repeat = src?.meta?.recurrence || "";
      const payload = {
        userId,
        sourceRippleId: doc._id,
        sourceEntryId: entry._id,
        automationRevision: automationRevisionOf(entry),
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
    logSafeError('entry automation gather extraction failed', err);
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
      automationRevision: automationRevisionOf(entry),
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

    if (await gatherDuplicateExists({
      userId,
      sourceEntryId: entry._id,
      automationRevision: automationRevisionOf(entry),
      list,
      normalizedTitle,
    })) continue;
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
    logSafeError('entry automation interest extraction failed', err);
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
      automationRevision: automationRevisionOf(entry),
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

    if (await interestDuplicateExists({
      userId,
      sourceEntryId: entry._id,
      automationRevision: automationRevisionOf(entry),
      category,
      normalizedTitle,
    })) continue;
    dedupedDocs.push({ ...doc, normalizedTitle });
  }

  return safeInsertMany(SuggestedInterest, dedupedDocs);
}

/* ------------------------------------------------------------------ */
/* Entry normalization                                                 */
/* ------------------------------------------------------------------ */

function normalizeEntryForCreate(payload = {}) {
  const normalized = normalizeEntryForUpdate(payload, {});
  if (typeof payload.clientRequestId === "string" && payload.clientRequestId.trim()) {
    normalized.clientRequestId = payload.clientRequestId.trim();
  }
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
    const hasText = Object.prototype.hasOwnProperty.call(payload, "text");
    const hasHtml = Object.prototype.hasOwnProperty.call(payload, "html");
    const hasContent = Object.prototype.hasOwnProperty.call(payload, "content");
    const nextText = hasText
      ? plainTextFrom({ text: payload.text })
      : plainTextFrom({
          html: hasHtml ? payload.html : "",
          content: hasContent ? payload.content : "",
        });
    normalized.text = nextText;

    const nextHtml = hasHtml ? payload.html : (hasContent ? payload.content : existing.html);
    const nextContent = hasContent ? payload.content : (hasHtml ? payload.html : existing.content);
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
/* Automation update dependencies                                      */
/* ------------------------------------------------------------------ */

/**
 * The persisted inputs that can change automation output. Keep this small
 * and explicit: organizational metadata is copied to new artifacts but does
 * not cause unchanged journal text to be interpreted again.
 */
export function normalizedAutomationInputs(entry = {}) {
  return {
    text: String(entry?.text || "").trim(),
    date: entry?.date ? normalizeDate(entry.date) : "",
  };
}

/**
 * Return the automation domains whose extractor inputs changed.
 *
 * Calendar parsing and task/ripple extraction resolve relative dates against
 * the entry date. Gather and interest extraction only inspect normalized text.
 */
export function affectedAutomationDomains(previousEntry, nextEntry) {
  const previous = normalizedAutomationInputs(previousEntry);
  const next = normalizedAutomationInputs(nextEntry);
  const textChanged = previous.text !== next.text;
  const dateChanged = previous.date !== next.date;

  return {
    textChanged,
    dateChanged,
    calendar: textChanged || dateChanged,
    tasks: textChanged || dateChanged,
    ripples: textChanged || dateChanged,
    gather: textChanged,
    interests: textChanged,
  };
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

export async function createEntryWithAutomation({ userId, payload = {} }) {
  const normalized = normalizeEntryForCreate(payload);
  normalized.clusters = await resolveOwnedClusterInputsOrThrow(userId, payload.clusters);
  [normalized.sectionId, normalized.linkedGoal, normalized.sectionPageId] = await Promise.all([
    resolveOwnedReferenceOrThrow({
      userId,
      value: payload.sectionId,
      resolver: resolveOwnedSectionId,
      field: "sectionId",
      resource: "sections",
    }),
    resolveOwnedReferenceOrThrow({
      userId,
      value: payload.linkedGoal,
      resolver: resolveOwnedGoalId,
      field: "linkedGoal",
      resource: "goals",
    }),
    resolveOwnedReferenceOrThrow({
      userId,
      value: payload.sectionPageId,
      resolver: resolveOwnedSectionPageId,
      field: "sectionPageId",
      resource: "section pages",
    }),
  ]);
  const analysis = analyzeEntrySafe({
    text: normalized.text,
    html: normalized.html,
    date: normalized.date,
  });
  const mergedTags = deDupeTags([...(normalized.tags || []), ...((analysis?.tags || []))]);

  const candidateTasks = buildSuggestedTasks({
    text: normalized.text,
    date: normalized.date,
    cluster: normalized.cluster,
    section: normalized.section,
  });
  const gatherOnlyEntry = isGatherOnlyEntry(normalized.text);
  const interestOnlyEntry = isInterestOnlyEntry(normalized.text, candidateTasks);
  const parsedSchedule = parseWorkSchedule(normalized.text, normalized.date);
  const suggestedTasks = gatherOnlyEntry || interestOnlyEntry || parsedSchedule ? [] : candidateTasks;

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
    ...(normalized.clientRequestId ? { clientRequestId: normalized.clientRequestId } : {}),
    suggestedTasks,
    automationPending: true,
    automationRevision: 1,
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
        if (!containsClusterPhrase(textForMatch, name)) continue;
        if (current.has(id)) continue;
        entry.clusters.push(cluster._id);
        current.add(id);
        changed = true;
      }

      if (changed) await entry.save();
    }
  } catch (err) {
    logSafeError('entry automation cluster assignment failed', err);
  }

  let result = entry;
  try {
    if (parsedSchedule) {
      await generateScheduleSuggestion({ entry, userId, parsed: parsedSchedule });
    } else {
      await runNlpSideEffects({ entry, analysis, userId });
      await runParsedCalendarSideEffects({ entry, userId });
    }

    if (!gatherOnlyEntry && !interestOnlyEntry && !parsedSchedule) {
      await generateRipplesAndSuggestions({ entry, text: normalized.text, userId });
    }
    await generateGatherSuggestions({ entry, text: normalized.text, userId });
    await generateInterestSuggestions({ entry, text: normalized.text, userId });
    result = await finalizeAutomationRevision({
      entry,
      userId,
      automationRevision: automationRevisionOf(entry),
    });
  } catch (error) {
    try {
      result = await recoverSupersededAutomationError({
        error,
        userId,
        entryId: entry._id,
        automationRevision: automationRevisionOf(entry),
      });
    } catch (currentError) {
      // The entry is already durable. Returning it avoids duplicate entries
      // when a client retries after a secondary automation write fails.
      logSafeError('entry automation post-create processing incomplete', currentError);
    }
  }

  return result;
}

export async function updateEntryWithAutomation({ userId, entryId, updates = {} }) {
  const entry = await Entry.findOne({ _id: entryId, userId });
  if (!entry) return null;

  const previousAutomationInputs = normalizedAutomationInputs(entry);
  const previousSchedule = parseWorkSchedule(
    previousAutomationInputs.text,
    previousAutomationInputs.date
  );
  const normalized = normalizeEntryForUpdate(updates, entry);
  const [resolvedClusters, resolvedSectionId, resolvedGoalId, resolvedSectionPageId] = await Promise.all([
    Object.prototype.hasOwnProperty.call(normalized, "clusters")
      ? resolveOwnedClusterInputsOrThrow(userId, updates.clusters)
      : undefined,
    Object.prototype.hasOwnProperty.call(normalized, "sectionId")
      ? resolveOwnedReferenceOrThrow({
          userId,
          value: updates.sectionId,
          resolver: resolveOwnedSectionId,
          field: "sectionId",
          resource: "sections",
        })
      : undefined,
    Object.prototype.hasOwnProperty.call(normalized, "linkedGoal")
      ? resolveOwnedReferenceOrThrow({
          userId,
          value: updates.linkedGoal,
          resolver: resolveOwnedGoalId,
          field: "linkedGoal",
          resource: "goals",
        })
      : undefined,
    Object.prototype.hasOwnProperty.call(normalized, "sectionPageId")
      ? resolveOwnedReferenceOrThrow({
          userId,
          value: updates.sectionPageId,
          resolver: resolveOwnedSectionPageId,
          field: "sectionPageId",
          resource: "section pages",
        })
      : undefined,
  ]);

  if (Object.prototype.hasOwnProperty.call(normalized, "date")) {
    entry.date = normalized.date;
  }
  if (Object.prototype.hasOwnProperty.call(normalized, "text")) {
    entry.text = normalized.text;
    entry.html = normalized.html || "";
    entry.content = normalized.content || "";
  }
  if (Object.prototype.hasOwnProperty.call(normalized, "mood")) {
    entry.mood = normalized.mood || "";
  }
  if (Object.prototype.hasOwnProperty.call(normalized, "cluster")) {
    entry.cluster = normalized.cluster || "";
  }
  if (Object.prototype.hasOwnProperty.call(normalized, "clusters")) {
    entry.clusters = resolvedClusters;
  }
  if (Object.prototype.hasOwnProperty.call(normalized, "section")) {
    entry.section = normalized.section || "";
  }
  if (Object.prototype.hasOwnProperty.call(normalized, "sectionId")) {
    entry.sectionId = resolvedSectionId;
  }
  if (Object.prototype.hasOwnProperty.call(normalized, "linkedGoal")) {
    entry.linkedGoal = resolvedGoalId;
  }
  if (Object.prototype.hasOwnProperty.call(normalized, "sectionPageId")) {
    entry.sectionPageId = resolvedSectionPageId;
  }
  if (Object.prototype.hasOwnProperty.call(normalized, "tags")) {
    entry.tags = normalized.tags;
  }
  if (Object.prototype.hasOwnProperty.call(normalized, "pinned")) {
    entry.pinned = !!normalized.pinned;
  }

  const affected = affectedAutomationDomains(previousAutomationInputs, entry);
  if (entry.automationPending) {
    affected.calendar = true;
    affected.tasks = true;
    affected.ripples = true;
    affected.gather = true;
    affected.interests = true;
  }
  let analysis = null;
  if (affected.calendar) {
    analysis = analyzeEntrySafe({ text: entry.text, html: entry.html, date: entry.date });
  }
  if (affected.textChanged) {
    entry.tags = deDupeTags([...(entry.tags || []), ...((analysis?.tags || []))]);
  }
  if (affected.tasks) {
    const candidateTasks = buildSuggestedTasks({
      text: entry.text,
      date: entry.date,
      cluster: entry.cluster,
      section: entry.section,
    });
    const updatedSchedule = parseWorkSchedule(entry.text, entry.date);
    entry.suggestedTasks = (isGatherOnlyEntry(entry.text) || isInterestOnlyEntry(entry.text, candidateTasks) || updatedSchedule)
      ? []
      : candidateTasks;
  }

  const hasAutomationWork = affected.calendar || affected.ripples || affected.gather || affected.interests;
  let runRevision = automationRevisionOf(entry);
  if (hasAutomationWork) {
    entry.automationPending = true;
    runRevision += 1;
    entry.automationRevision = runRevision;
  }
  const updated = await entry.save();

  try {
    if (affected.calendar) {
      await clearAutomationCalendarArtifacts({
        userId,
        entryId: updated._id,
        beforeRevision: runRevision,
      });
      const updatedSchedule = parseWorkSchedule(updated.text, updated.date);
      if (previousSchedule || updatedSchedule) {
        await clearPendingScheduleSuggestions({
          userId,
          entryId: updated._id,
          beforeRevision: runRevision,
        });
      }
      if (updatedSchedule) {
        await generateScheduleSuggestion({ entry: updated, userId, parsed: updatedSchedule });
      } else {
        await runNlpSideEffects({ entry: updated, analysis, userId });
        await runParsedCalendarSideEffects({ entry: updated, userId });
      }
    }

    if (affected.ripples) {
      const excludedTextKeys = await finalRippleDecisionKeys({ userId, entryId: updated._id });
      await clearRippleArtifacts({
        userId,
        entryId: updated._id,
        beforeRevision: runRevision,
      });
      const updatedGatherOnly = isGatherOnlyEntry(updated.text);
      const updatedTaskCandidates = buildSuggestedTasks({
        text: updated.text,
        date: updated.date,
        cluster: updated.cluster,
        section: updated.section,
      });
      const updatedInterestOnly = isInterestOnlyEntry(updated.text, updatedTaskCandidates);
      const updatedSchedule = parseWorkSchedule(updated.text, updated.date);
      if (!updatedGatherOnly && !updatedInterestOnly && !updatedSchedule) {
        await generateRipplesAndSuggestions({
          entry: updated,
          text: updated.text,
          userId,
          excludedTextKeys,
        });
      }
    }
    if (affected.gather) {
      await clearPendingGatherSuggestions({
        userId,
        entryId: updated._id,
        beforeRevision: runRevision,
      });
      await generateGatherSuggestions({ entry: updated, text: updated.text, userId });
    }
    if (affected.interests) {
      await clearPendingInterestSuggestions({
        userId,
        entryId: updated._id,
        beforeRevision: runRevision,
      });
      await generateInterestSuggestions({ entry: updated, text: updated.text, userId });
    }

    if (hasAutomationWork) {
      return finalizeAutomationRevision({ entry: updated, userId, automationRevision: runRevision });
    }
  } catch (error) {
    if (!hasAutomationWork) throw error;
    return recoverSupersededAutomationError({
      error,
      userId,
      entryId: updated._id,
      automationRevision: runRevision,
    });
  }

  return updated;
}

/* ------------------------------------------------------------------ */
/* Test-only exports                                                   */
/* ------------------------------------------------------------------ */

export const __testables = {
  buildSuggestedTasks,
  normalizeOptionalString,
  normalizedAutomationInputs,
  affectedAutomationDomains,
  parseAppointmentsFromText,
  parseWorkSchedule,
  reconcileWorkSchedule,
  resolveOrdinalDayDate,
  normalizeEntryForUpdate,
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
  clearPendingScheduleSuggestions,
  clearAutomationCalendarArtifacts,
};
