// server/routes/tasks.js
import express from 'express';
import mongoose from 'mongoose';
import Task from '../models/Task.js';
import Entry from '../models/Entry.js';
import { getTasks } from '../services/taskService.js';
import { normalizeClusterIds, resolveClusterIdForOwner, resolveClusterIdsForOwner } from '../utils/clusterIds.js';
import { torontoYmd, addDaysISO as addDaysToISO } from '../utils/date.js';
import {
  isValidISODate,
  nextMonthlyOccurrenceISO,
  parseRRule,
  recurrenceValidationError,
} from '../utils/recurrence.js';
import { logSafeError } from '../utils/errorHandler.js';

const router = express.Router();
const { ObjectId } = mongoose.Types;
const RECURRENCE_TASK_FIELDS = 'completed completedAt status title notes dueDate priority clusters sections rrule entryId goalId';
const CLIENT_REQUEST_ID_PATTERN = /^[a-z0-9][a-z0-9._:-]{7,127}$/i;

/* ---------------------- helpers ---------------------- */
function getUserId(req) {
  return req.user?.userId || req.user?._id || req.user?.id || null;
}
function isValidId(id) {
  return ObjectId.isValid(id);
}
function normalizeIdArray(raw) {
  const arr = Array.isArray(raw) ? raw : [];
  const unique = new Map();
  for (const value of arr) {
    if (!isValidId(value)) continue;
    const id = new ObjectId(value);
    unique.set(id.toString(), id);
  }
  return [...unique.values()];
}

async function createRecurringSuccessor(payload, sourceTaskId) {
  try {
    return await Task.create({ ...payload, recurrenceSourceTaskId: sourceTaskId });
  } catch (error) {
    if (error?.code !== 11000) throw error;
    const existing = await Task.findOne({
      userId: payload.userId,
      recurrenceSourceTaskId: sourceTaskId,
    });
    if (existing?.deletedAt) {
      const recovered = await Task.findOneAndUpdate(
        { _id: existing._id, userId: payload.userId, deletedAt: { $ne: null } },
        { $set: { ...payload, deletedAt: null } },
        { new: true, runValidators: true }
      );
      if (recovered) return recovered;
    }
    if (existing) return existing;
    throw error;
  }
}

async function ensureRecurringSuccessor(task, userId) {
  if (!task?.rrule || !task?.dueDate) return null;

  const recurrence = nextRecurrenceFromRRule(task.rrule, task.dueDate);
  if (!recurrence) return null;

  const safeTitle = (typeof task.title === 'string' && task.title.trim())
    ? task.title.trim()
    : '(untitled)';
  const safePriority = Number.isFinite(Number(task.priority)) ? Number(task.priority) : 0;
  const next = await createRecurringSuccessor({
    userId,
    title: safeTitle,
    notes: task.notes || '',
    dueDate: recurrence.dueDate,
    priority: safePriority,
    clusters: Array.isArray(task.clusters) ? task.clusters : [],
    sections: Array.isArray(task.sections) ? task.sections : [],
    rrule: recurrence.rrule,
    ...(task.entryId ? { entryId: task.entryId } : {}),
    ...(task.goalId ? { goalId: task.goalId } : {}),
    completed: false,
    status: 'todo',
  }, task._id);
  await next.populate({ path: 'clusters', select: 'name slug icon color', match: { ownerId: userId } });
  return next;
}

// Keep every state-directed completion endpoint on one compare-and-set path.
// A repeated completed=true request also repairs a successor that may have
// been missed if the first request stopped after updating the source task.
export async function setTaskCompletionForOwner({
  userId,
  taskId,
  completed,
  incompleteStatus = null,
  sourceTask = null,
}) {
  const task = sourceTask || await Task.findOne(
    { _id: taskId, userId, deletedAt: null },
    RECURRENCE_TASK_FIELDS
  ).lean();
  if (!task) return { outcome: 'not-found', changed: false, task: null, next: null };

  const hasDesiredState = typeof completed === 'boolean';
  const nowCompleted = hasDesiredState ? completed : !task.completed;
  const desiredStatus = nowCompleted
    ? 'done'
    : (['todo', 'doing'].includes(incompleteStatus)
      ? incompleteStatus
      : (task.status === 'done' ? 'todo' : task.status || 'todo'));

  if (nowCompleted === task.completed && desiredStatus === task.status) {
    const next = nowCompleted ? await ensureRecurringSuccessor(task, userId) : null;
    return { outcome: 'ok', changed: false, task, next };
  }

  const completedAt = nowCompleted ? (task.completedAt || new Date()) : null;
  const stateMatch = {
    _id: taskId,
    userId,
    deletedAt: null,
    completed: task.completed,
    ...(task.status !== undefined ? { status: task.status } : {}),
  };
  const updated = await Task.findOneAndUpdate(
    stateMatch,
    { $set: { completed: nowCompleted, status: desiredStatus, completedAt } },
    { new: true, runValidators: true }
  ).populate({ path: 'clusters', select: 'name slug icon color', match: { ownerId: userId } })
   .populate({ path: 'entryId', select: 'date title', match: { userId } })
   .lean();

  if (!updated) {
    if (hasDesiredState) {
      const latest = await Task.findOne(
        { _id: taskId, userId, deletedAt: null },
        RECURRENCE_TASK_FIELDS
      ).lean();
      if (latest?.completed === nowCompleted && latest?.status === desiredStatus) {
        const next = nowCompleted ? await ensureRecurringSuccessor(latest, userId) : null;
        return { outcome: 'ok', changed: false, task: latest, next };
      }
    }
    return { outcome: 'conflict', changed: false, task: null, next: null };
  }

  const next = nowCompleted ? await ensureRecurringSuccessor(task, userId) : null;
  return { outcome: 'ok', changed: true, task: updated, next };
}

/* Core lister wrapped so it never explodes */
async function listTasks(req, res) {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const requestedDate = req.query?.dueDate || req.query?.date;
    if (requestedDate && !isValidISODate(requestedDate)) {
      return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
    }

    const result = await getTasks(userId, req.query || {});
    res.json(result);
  } catch (e) {
    logSafeError('tasks list failed', e);
    res.status(500).json({ error: 'list failed' });
  }
}

/* ---------------------- routes ---------------------- */

// GET /api/tasks
router.get('/', listTasks);

router.get('/day/:date', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const date = req.params.date;
    if (!isValidISODate(date)) return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
    const [dueToday, onYourRadar] = await Promise.all([
      Task.find({ userId, dueDate: { $nin: [null, ''], $lte: date }, completed: false, deletedAt: null }).sort({ dueDate: 1 }),
      Task.find({ userId, $or: [{ dueDate: null }, { dueDate: '' }, { dueDate: { $exists: false } }], completed: false, deletedAt: null })
    ]);
    res.json({ dueToday, onYourRadar });
  } catch (e) {
    logSafeError('tasks day list failed', e);
    res.status(500).json({ error: 'list failed' });
  }
});

// POST /api/tasks/carry-forward  { from?, to?, cluster? }
router.post('/carry-forward', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    let from = String(req.body?.from ?? req.query?.from ?? '').trim();
    let to = String(req.body?.to ?? req.query?.to ?? '').trim();
    const cluster = String(req.body?.cluster ?? req.query?.cluster ?? '').trim();

    if (!from && !to) {
      from = torontoYmd();
      to = addDaysToISO(from, 1);
    } else if (from && !to) {
      to = addDaysToISO(from, 1);
    } else if (!from && to) {
      from = torontoYmd();
    }

    if (!isValidISODate(from) || !isValidISODate(to)) {
      return res.status(400).json({ error: 'from and to must be YYYY-MM-DD', got: { from, to } });
    }

    const match = { userId, completed: false, dueDate: from, deletedAt: null };
    if (cluster) {
      const clusterId = await resolveClusterIdForOwner(userId, cluster);
      if (!clusterId) return res.status(404).json({ error: 'cluster not found' });
      match.clusters = clusterId;
    }

    const result = await Task.updateMany(match, { $set: { dueDate: to } });
    return res.json({ moved: result.modifiedCount || 0, from, to, cluster: cluster || null });
  } catch (e) {
    logSafeError('tasks carry forward failed', e);
    return res.status(500).json({ error: 'carry-forward failed' });
  }
});

// POST /api/tasks/from-entry  { entryId, title?, text?, dueDate?, cluster? }
router.post('/from-entry', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { entryId, title = '', text = '', dueDate = null, cluster = '' } = req.body || {};
    if (!entryId || !isValidId(entryId)) return res.status(400).json({ error: 'entryId required' });
    if (dueDate && !isValidISODate(dueDate)) return res.status(400).json({ error: 'dueDate must be YYYY-MM-DD' });

    const entry = await Entry.findOne({ _id: entryId, userId }).lean();
    if (!entry) return res.status(404).json({ error: 'entry not found' });

    let clusterIds = [];
    if (cluster) {
      const clusterId = await resolveClusterIdForOwner(userId, cluster);
      if (clusterId) clusterIds = [clusterId];
    } else if (Array.isArray(entry.clusters) && entry.clusters.length) {
      clusterIds = normalizeClusterIds(entry.clusters);
    }

    const safeTitle = String(title || entry.title || 'Task').trim().slice(0, 200) || 'Task';
    const safeNotes = String(text || entry.text || entry.content || '').slice(0, 5000);

    const created = await Task.create({
      userId,
      title: safeTitle,
      notes: safeNotes,
      dueDate: dueDate || entry.date || null,
      clusters: clusterIds,
      sections: [],
      rrule: '',
      completed: false,
      status: 'todo',
      entryId,
    });

    await created.populate({ path: 'clusters', select: 'name slug icon color', match: { ownerId: userId } });
    return res.status(201).json({ ok: true, task: created });
  } catch (e) {
    logSafeError('tasks from entry failed', e);
    return res.status(500).json({ error: 'from-entry failed' });
  }
});

// POST /api/tasks/:id/link-entry  { entryId? | date?, autoCreate?, title? }
router.post('/:id/link-entry', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ error: 'Invalid task id' });

    const task = await Task.findOne({ _id: id, userId, deletedAt: null });
    if (!task) return res.status(404).json({ error: 'task not found' });

    const bodyEntryId = String(req.body?.entryId || '').trim();
    const date = String(req.body?.date || '').trim();
    const autoCreate = Boolean(req.body?.autoCreate);
    const title = String(req.body?.title || '').trim();

    let entry = null;
    if (bodyEntryId) {
      if (!isValidId(bodyEntryId)) return res.status(400).json({ error: 'Invalid entryId' });
      entry = await Entry.findOne({ _id: bodyEntryId, userId });
    } else if (date) {
      if (!isValidISODate(date)) return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
      entry = await Entry.findOne({ userId, date });
      if (!entry && autoCreate) {
        entry = await Entry.create({
          userId,
          date,
          text: '',
          content: '',
          html: '',
          title: title || `Journal for ${date}`,
        });
      }
    } else {
      return res.status(400).json({ error: 'Provide entryId or date' });
    }

    if (!entry) return res.status(404).json({ error: 'entry not found' });

    task.entryId = entry._id;
    await task.save();

    return res.json({ ok: true, taskId: task._id, entryId: entry._id, date: entry.date || null });
  } catch (e) {
    logSafeError('tasks link entry failed', e);
    return res.status(500).json({ error: 'link-entry failed' });
  }
});

// PATCH/PUT /api/tasks/:id
async function updateTask(req, res) {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ error: 'Invalid id' });
    const up = {};
    for (const k of ['title','notes','dueDate','completed','priority','clusters','sections','rrule','status']) {
      if (req.body[k] !== undefined) up[k] = req.body[k];
    }
    if (typeof up.title === 'string') {
      up.title = up.title.trim();
      if (!up.title) return res.status(400).json({ error: 'title required' });
    }
    if (up.completed !== undefined && typeof up.completed !== 'boolean') {
      return res.status(400).json({ error: 'completed must be a boolean' });
    }
    const allowedStatuses = ['todo', 'doing', 'done'];
    if (up.status !== undefined && !allowedStatuses.includes(String(up.status))) {
      return res.status(400).json({ error: 'status must be todo, doing, or done' });
    }
    if (req.body?.clusterId !== undefined && up.clusters === undefined) {
      const resolved = await resolveClusterIdForOwner(userId, req.body.clusterId);
      up.clusters = resolved ? [resolved] : [];
    } else if (req.body?.cluster !== undefined && up.clusters === undefined) {
      const resolved = await resolveClusterIdForOwner(userId, req.body.cluster);
      up.clusters = resolved ? [resolved] : [];
    }

    const doc = await Task.findOne({ _id: id, userId, deletedAt: null });
    if (!doc) return res.status(404).json({ error: 'Not found' });

    let hasNonCompletionUpdate = false;
    if (up.title !== undefined) {
      doc.title = up.title;
      hasNonCompletionUpdate = true;
    }
    if (up.notes !== undefined) {
      doc.notes = typeof up.notes === 'string' ? up.notes : '';
      hasNonCompletionUpdate = true;
    }
    if (up.dueDate !== undefined) {
      if (up.dueDate && !isValidISODate(up.dueDate)) {
        return res.status(400).json({ error: 'dueDate must be YYYY-MM-DD' });
      }
      doc.dueDate = up.dueDate || null;
      hasNonCompletionUpdate = true;
    }
    if (up.priority !== undefined) {
      doc.priority = Number.isFinite(Number(up.priority)) ? Number(up.priority) : 0;
      hasNonCompletionUpdate = true;
    }
    if (up.clusters !== undefined) {
      doc.clusters = await resolveClusterIdsForOwner(userId, up.clusters);
      hasNonCompletionUpdate = true;
    }
    if (up.sections !== undefined) {
      doc.sections = Array.isArray(up.sections) ? up.sections : [];
      hasNonCompletionUpdate = true;
    }
    if (up.rrule !== undefined) {
      doc.rrule = typeof up.rrule === 'string' ? up.rrule : '';
      hasNonCompletionUpdate = true;
    }
    const recurrenceError = recurrenceValidationError(doc.rrule, doc.dueDate || '');
    if (recurrenceError) return res.status(400).json({ error: recurrenceError });
    const hasCompletionRequest = up.completed !== undefined || up.status !== undefined;
    const saved = hasNonCompletionUpdate ? await doc.save() : doc;
    if (hasCompletionRequest) {
      // Explicit completed state wins when old clients send both fields.
      const desiredCompleted = up.completed !== undefined
        ? up.completed
        : String(up.status) === 'done';
      const incompleteStatus = !desiredCompleted && ['todo', 'doing'].includes(String(up.status))
        ? String(up.status)
        : null;
      const result = await setTaskCompletionForOwner({
        userId,
        taskId: id,
        completed: desiredCompleted,
        incompleteStatus,
        sourceTask: saved,
      });
      if (result.outcome === 'not-found') return res.status(404).json({ error: 'Not found' });
      if (result.outcome === 'conflict') {
        return res.status(409).json({ error: 'Task changed; refresh and try again' });
      }
      // Preserve the established PATCH response shape while reflecting the
      // atomic state change made by the shared completion path.
      saved.completed = result.task.completed;
      saved.status = result.task.status;
      saved.completedAt = result.task.completedAt ?? null;
    }

    await saved.populate({ path: 'clusters', select: 'name slug icon color', match: { ownerId: userId } });
    await saved.populate({ path: 'entryId', select: 'date title', match: { userId } });
    res.json(saved);
  } catch (e) {
    logSafeError('tasks update failed', e);
    res.status(500).json({ error: 'update failed' });
  }
}
router.patch('/:id', updateTask);
router.put('/:id', updateTask);

// Toggle + spawn next if recurring (validation-safe)
router.patch('/:id/toggle', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ error: 'Invalid id' });

    const hasDesiredState = Object.prototype.hasOwnProperty.call(req.body || {}, 'completed');
    if (hasDesiredState && typeof req.body.completed !== 'boolean') {
      return res.status(400).json({ error: 'completed must be a boolean' });
    }

    const result = await setTaskCompletionForOwner({
      userId,
      taskId: id,
      completed: hasDesiredState ? req.body.completed : undefined,
    });
    if (result.outcome === 'not-found') return res.status(404).json({ error: 'Not found' });
    if (result.outcome === 'conflict') {
      return res.status(409).json({ error: 'Task changed; refresh and try again' });
    }
    return res.json({ task: result.task, next: result.next });
  } catch (e) {
    logSafeError('tasks toggle failed', e);
    return res.status(500).json({ error: 'toggle failed' });
  }
});

// POST /api/tasks (create)
router.post('/', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    let { title, notes, note, dueDate, priority = 0, clusters = [], sections = [], rrule = '', status = 'todo', completed = false } = req.body || {};
    const requestIdInput = req.get?.('Idempotency-Key') ?? req.body?.clientRequestId;
    const clientRequestId = requestIdInput == null || requestIdInput === ''
      ? ''
      : (typeof requestIdInput === 'string' ? requestIdInput.trim() : null);
    if (clientRequestId === null || (clientRequestId && !CLIENT_REQUEST_ID_PATTERN.test(clientRequestId))) {
      return res.status(400).json({ error: 'Idempotency-Key is invalid' });
    }
    if (clientRequestId) {
      const replay = await Task.findOne({ userId, clientRequestId });
      if (replay) {
        if (replay.deletedAt) return res.status(409).json({ error: 'This task request already exists in trash' });
        await replay.populate({ path: 'clusters', select: 'name slug icon color', match: { ownerId: userId } });
        res.set('Idempotency-Replayed', 'true');
        return res.status(200).json(replay);
      }
    }
    title = typeof title === 'string' ? title.trim() : '';
    if (!title) return res.status(400).json({ error: 'title required' });
    if (dueDate && !isValidISODate(dueDate)) return res.status(400).json({ error: 'dueDate must be YYYY-MM-DD' });
    const recurrenceError = recurrenceValidationError(rrule, dueDate || '');
    if (recurrenceError) return res.status(400).json({ error: recurrenceError });
    if (notes === undefined && typeof note === 'string') notes = note;

    const allowedStatuses = ['todo', 'doing', 'done'];
    const safeStatus = allowedStatuses.includes(status) ? status : 'todo';
    const safeCompleted = Boolean(completed) || safeStatus === 'done';

    let clusterIds = await resolveClusterIdsForOwner(userId, clusters);
    if (!clusterIds.length && req.body?.clusterId) {
      const resolved = await resolveClusterIdForOwner(userId, req.body.clusterId);
      if (resolved) clusterIds = [resolved];
    } else if (!clusterIds.length && req.body?.cluster) {
      const resolved = await resolveClusterIdForOwner(userId, req.body.cluster);
      if (resolved) clusterIds = [resolved];
    }

    const doc = await Task.create({
      userId,
      title,
      notes: notes || '',
      dueDate: dueDate || null,
      priority,
      clusters: clusterIds,
      sections: sections || [],
      rrule,
      completed: safeCompleted,
      status: safeCompleted ? 'done' : safeStatus,
      ...(clientRequestId ? { clientRequestId } : {}),
    });
    await doc.populate({ path: 'clusters', select: 'name slug icon color', match: { ownerId: userId } });
    await doc.populate({ path: 'entryId', select: 'date title', match: { userId } });
    res.status(201).json(doc);
  } catch (e) {
    if (e?.code === 11000) {
      const userId = getUserId(req);
      const raw = req.get?.('Idempotency-Key') ?? req.body?.clientRequestId;
      const clientRequestId = typeof raw === 'string' ? raw.trim() : '';
      if (userId && CLIENT_REQUEST_ID_PATTERN.test(clientRequestId)) {
        const replay = await Task.findOne({ userId, clientRequestId, deletedAt: null });
        if (replay) {
          await replay.populate({ path: 'clusters', select: 'name slug icon color', match: { ownerId: userId } });
          res.set('Idempotency-Replayed', 'true');
          return res.status(200).json(replay);
        }
      }
    }
    // validation stays 400; everything else 500
    const code = e?.name === 'ValidationError' ? 400 : 500;
    logSafeError('tasks create failed', e);
    res.status(code).json({ error: code === 400 ? 'Invalid task' : 'create failed' });
  }
});

// DELETE /api/tasks/:id  → soft delete a single task
router.delete('/:id', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ error: 'Invalid id' });
    const doc = await Task.findOneAndUpdate(
      { _id: id, userId, deletedAt: null },
      { $set: { deletedAt: new Date() } },
      { new: true }
    );
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true, deleted: doc._id });
  } catch (e) {
    logSafeError('tasks delete failed', e);
    res.status(500).json({ error: 'delete failed' });
  }
});

// POST /api/tasks/bulk-delete  → soft delete many by id
router.post('/bulk-delete', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const ids = normalizeIdArray(req.body?.ids);
    if (ids.length === 0) return res.status(400).json({ error: 'valid ids required' });
    const r = await Task.updateMany(
      { _id: { $in: ids }, userId, deletedAt: null },
      { $set: { deletedAt: new Date() } }
    );
    res.json({ ok: true, deletedCount: r.modifiedCount });
  } catch (e) {
    logSafeError('tasks bulk delete legacy failed', e);
    res.status(500).json({ error: 'bulk-delete failed' });
  }
});


/* -------- minimal recurrence helpers (daily/weekly/monthly) -------- */
function addDaysISO(iso, n) {
  const [Y, M, D] = iso.split('-').map(Number);
  const d = new Date(Date.UTC(Y, M - 1, D));
  d.setUTCDate(d.getUTCDate() + n);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
const DOW = { SU:0, MO:1, TU:2, WE:3, TH:4, FR:5, SA:6 };
function nextWeeklyOccurrenceISO(fromISO, byDayCodes, interval) {
  const current = new Date(`${fromISO}T12:00:00Z`);
  const currentMondayOffset = (current.getUTCDay() + 6) % 7;
  const targetOffsets = [...new Set(byDayCodes
    .map((code) => DOW[code])
    .filter((day) => Number.isInteger(day))
    .map((day) => (day + 6) % 7))]
    .sort((a, b) => a - b);

  if (!targetOffsets.length) return addDaysISO(fromISO, 7 * interval);

  const laterThisWeek = targetOffsets.find((offset) => offset > currentMondayOffset);
  if (laterThisWeek !== undefined) {
    return addDaysISO(fromISO, laterThisWeek - currentMondayOffset);
  }

  return addDaysISO(
    fromISO,
    (7 * interval) - currentMondayOffset + targetOffsets[0]
  );
}
function nextFromRRule(rrule, fromISO) {
  if (!rrule || !fromISO) return '';
  const parts = parseRRule(rrule);
  const parsedCount = Number.parseInt(parts.COUNT || '', 10);
  if (parts.COUNT && (!Number.isFinite(parsedCount) || parsedCount <= 1)) return '';
  const FREQ = parts.FREQ;
  const INTERVAL = Math.max(1, parseInt(parts.INTERVAL || '1', 10));
  let next = '';
  if (FREQ === 'DAILY') next = addDaysISO(fromISO, INTERVAL);
  if (FREQ === 'WEEKLY') {
    const by = (parts.BYDAY || '').split(',').filter(Boolean);
    next = nextWeeklyOccurrenceISO(fromISO, by, INTERVAL);
  }
  if (FREQ === 'MONTHLY') {
    next = nextMonthlyOccurrenceISO(fromISO, INTERVAL);
  }
  if (parts.UNTIL && next > parts.UNTIL) return '';
  return next;
}

function rruleForNextOccurrence(rrule) {
  const parts = String(rrule || '').split(';');
  return parts.map((part) => {
    const separator = part.indexOf('=');
    if (separator < 0 || part.slice(0, separator).trim().toUpperCase() !== 'COUNT') return part;
    const count = Number.parseInt(part.slice(separator + 1).trim(), 10);
    return Number.isFinite(count) && count > 1 ? `COUNT=${count - 1}` : part;
  }).join(';');
}

function nextRecurrenceFromRRule(rrule, fromISO) {
  const dueDate = nextFromRRule(rrule, fromISO);
  if (!dueDate) return null;
  return { dueDate, rrule: rruleForNextOccurrence(rrule) };
}

// Bulk operations
// POST /api/tasks/bulk/complete - Mark multiple tasks as complete
router.post('/bulk/complete', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const ids = normalizeIdArray(req.body?.ids);
    if (ids.length === 0) {
      return res.status(400).json({ error: 'valid ids required' });
    }

    const tasks = await Task.find(
      { _id: { $in: ids }, userId, deletedAt: null },
      RECURRENCE_TASK_FIELDS
    ).lean();

    let modified = 0;
    let successors = 0;
    let conflicts = 0;
    for (const task of tasks) {
      const result = await setTaskCompletionForOwner({
        userId,
        taskId: task._id,
        completed: true,
        sourceTask: task,
      });
      if (result.outcome === 'conflict') {
        conflicts += 1;
        continue;
      }
      if (result.changed) modified += 1;
      if (result.next) successors += 1;
    }

    if (conflicts > 0) {
      return res.status(409).json({ ok: false, modified, successors, conflicts });
    }
    res.json({ ok: true, modified, successors });
  } catch (e) {
    logSafeError('tasks bulk complete failed', e);
    res.status(500).json({ error: 'bulk complete failed' });
  }
});

// POST /api/tasks/bulk/delete - Soft delete multiple tasks
router.post('/bulk/delete', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const ids = normalizeIdArray(req.body?.ids);
    if (ids.length === 0) {
      return res.status(400).json({ error: 'valid ids required' });
    }

    const result = await Task.updateMany(
      { _id: { $in: ids }, userId, deletedAt: null },
      { $set: { deletedAt: new Date() } }
    );

    res.json({ ok: true, deleted: result.modifiedCount });
  } catch (e) {
    logSafeError('tasks bulk delete failed', e);
    res.status(500).json({ error: 'bulk delete failed' });
  }
});

// POST /api/tasks/bulk/move - Move multiple tasks to a cluster
router.post('/bulk/move', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const ids = normalizeIdArray(req.body?.ids);
    if (ids.length === 0) {
      return res.status(400).json({ error: 'valid ids required' });
    }

    const rawCluster = req.body?.clusterId ?? req.body?.cluster ?? null;
    const clusterKey = typeof rawCluster === 'string' ? rawCluster.trim() : rawCluster;
    const clusterObjectId = clusterKey ? await resolveClusterIdForOwner(userId, clusterKey) : null;
    if (!clusterObjectId && clusterKey) {
      return res.status(404).json({ error: 'Cluster not found' });
    }

    const clusters = clusterObjectId ? [clusterObjectId] : [];
    const result = await Task.updateMany(
      { _id: { $in: ids }, userId },
      { $set: { clusters } }
    );

    res.json({ ok: true, modified: result.modifiedCount });
  } catch (e) {
    logSafeError('tasks bulk move failed', e);
    res.status(500).json({ error: 'bulk move failed' });
  }
});

// GET /api/tasks/trash - View deleted tasks
router.get('/trash', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const tasks = await Task.find({
      userId,
      deletedAt: { $ne: null }
    })
    .sort({ deletedAt: -1 })
    .limit(100)
    .populate({ path: 'clusters', select: 'name slug icon color', match: { ownerId: userId } })
    .lean();

    res.json(tasks);
  } catch (e) {
    logSafeError('tasks trash list failed', e);
    res.status(500).json({ error: 'trash list failed' });
  }
});

// POST /api/tasks/:id/restore - Restore a deleted task
router.post('/:id/restore', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ error: 'Invalid id' });

    const doc = await Task.findOneAndUpdate(
      { _id: id, userId, deletedAt: { $ne: null } },
      { $set: { deletedAt: null } },
      { new: true }
    ).populate({ path: 'clusters', select: 'name slug icon color', match: { ownerId: userId } });

    if (!doc) return res.status(404).json({ error: 'Not found or not deleted' });
    res.json({ ok: true, task: doc });
  } catch (e) {
    logSafeError('tasks restore failed', e);
    res.status(500).json({ error: 'restore failed' });
  }
});

// DELETE /api/tasks/:id/permanent - Permanently delete a task
router.delete('/:id/permanent', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ error: 'Invalid id' });

    const doc = await Task.findOneAndDelete({
      _id: id,
      userId,
      deletedAt: { $ne: null }
    });

    if (!doc) return res.status(404).json({ error: 'Not found or not in trash' });
    res.json({ ok: true, deleted: doc._id });
  } catch (e) {
    logSafeError('tasks permanent delete failed', e);
    res.status(500).json({ error: 'permanent delete failed' });
  }
});

// POST /api/tasks/trash/empty - Permanently delete all trash items
router.post('/trash/empty', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const result = await Task.deleteMany({
      userId,
      deletedAt: { $ne: null }
    });

    res.json({ ok: true, deletedCount: result.deletedCount });
  } catch (e) {
    logSafeError('tasks empty trash failed', e);
    res.status(500).json({ error: 'empty trash failed' });
  }
});

export default router;
