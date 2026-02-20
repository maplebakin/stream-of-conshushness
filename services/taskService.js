// services/taskService.js
import Task from '../models/Task.js';
import { resolveClusterIdForOwner } from '../utils/clusterIds.js';

/* ---------------------- helpers ---------------------- */
function parseBool(v, def = false) {
  if (v == null) return def;
  const s = String(v).toLowerCase();
  return s === '1' || s === 'true' || s === 'yes';
}

function clamp(n, lo, hi) {
  const x = parseInt(n, 10);
  if (Number.isNaN(x)) return lo;
  return Math.max(lo, Math.min(hi, x));
}

function torontoYmd(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const y = parts.find((p) => p.type === 'year')?.value;
  const m = parts.find((p) => p.type === 'month')?.value;
  const d = parts.find((p) => p.type === 'day')?.value;
  return `${y}-${m}-${d}`;
}

export async function getTasks(userId, query) {
  const {
    view,
    date,
    dueDate,
    cluster,
    includeCompleted,
    completed,
    includeOverdue,
    includeRecurring,
    countOnly,
    limit,
    offset,
    section,
  } = query;

  const q = { userId, deletedAt: null };
  const predicates = [];

  const dayISO = dueDate || date || torontoYmd();
  const normalizedView = String(view || '').toLowerCase();

  if (normalizedView === 'inbox') {
    predicates.push({ $or: [{ dueDate: null }, { dueDate: '' }, { dueDate: { $exists: false } }] });
  } else if (normalizedView === 'today') {
    const includeOver = parseBool(includeOverdue, false);
    predicates.push(
      includeOver
        ? { $or: [{ dueDate: dayISO }, { dueDate: { $lt: dayISO, $ne: null } }] }
        : { dueDate: dayISO }
    );
  } else if (dueDate || date) {
    predicates.push({ dueDate: dayISO });
  }

  let clusterIdFilter = null;
  if (query.clusterId) {
    clusterIdFilter = await resolveClusterIdForOwner(userId, query.clusterId);
  } else if (cluster) {
    clusterIdFilter = await resolveClusterIdForOwner(userId, cluster);
  }

  if (query.clusterId || cluster) {
    if (!clusterIdFilter) return parseBool(countOnly, false) ? { count: 0 } : [];
    q.clusters = clusterIdFilter;
  }

  if (section) q.sections = String(section);

  if (completed !== undefined) {
    q.completed = parseBool(completed);
  } else if (!parseBool(includeCompleted, false)) {
    q.completed = false;
  }

  if (!parseBool(includeRecurring, true)) {
    predicates.push({ $or: [{ rrule: '' }, { rrule: null }, { rrule: { $exists: false } }] });
  }

  if (predicates.length) {
    q.$and = predicates;
  }

  if (parseBool(countOnly, false)) {
    const count = await Task.countDocuments(q);
    return { count };
  }

  const lim = clamp(limit ?? 200, 1, 1000);
  const off = clamp(offset ?? 0, 0, 1_000_000);

  const sort = { completed: 1, dueDate: 1, createdAt: -1 };
  const items = await Task.find(q)
    .sort(sort)
    .skip(off)
    .limit(lim)
    .populate('clusters', 'name slug icon color')
    .lean();

  return items;
}
