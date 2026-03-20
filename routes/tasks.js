// server/routes/tasks.js
import express from 'express';
import mongoose from 'mongoose';
import Task from '../models/Task.js';
import Entry from '../models/Entry.js';
import { normalizeClusterIds, resolveClusterIdForOwner } from '../utils/clusterIds.js';

const router = express.Router();
const { ObjectId } = mongoose.Types;

/* ---------------------- helpers ---------------------- */
function getUserId(req) {
  return req.user?.userId || req.user?._id || req.user?.id || null;
}
function isValidId(id) {
  return ObjectId.isValid(id);
}
function normalizeIdArray(raw) {
  const arr = Array.isArray(raw) ? raw : [];
  const ids = arr.filter((v) => isValidId(v)).map((v) => new ObjectId(v));
  return ids;
}

function parseBool(v, def = false) {
  if (v === undefined || v === null) return def;
  if (typeof v === 'boolean') return v;
  const s = String(v).toLowerCase();
  if (s === '1' || s === 'true' || s === 'yes') return true;
  if (s === '0' || s === 'false' || s === 'no') return false;
  return def;
}
function clamp(n, min, max) {
  const num = Number(n);
  if (!Number.isFinite(num)) return min;
  return Math.min(Math.max(num, min), max);
}

/* Core lister wrapped so it never explodes */
async function listTasks(req, res) {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const {
      date,            // alias of dueDate
      dueDate,
      cluster,         // single cluster key (string)
      includeCompleted,
      includeOverdue,
      includeRecurring,
      completed,       // explicit completed=true/false overrides includeCompleted
      limit,
      offset,
      section,
    } = req.query;

    const q = { userId, deletedAt: null };

    const dayISO = dueDate || date;
    const includeOverdueFlag = parseBool(includeOverdue, false);
    const includeRecurringFlag = parseBool(includeRecurring, true);

    if (dayISO) {
      if (includeOverdueFlag && date) {
        q.$or = [
          { dueDate: dayISO },
          { dueDate: { $lt: dayISO }, completed: false },
        ];
      } else {
        q.dueDate = dayISO;
      }
    }

    let clusterIdFilter = null;
    if (req.query.clusterId) {
      clusterIdFilter = await resolveClusterIdForOwner(userId, req.query.clusterId);
    } else if (cluster) {
      clusterIdFilter = await resolveClusterIdForOwner(userId, cluster);
    }
    if (req.query.clusterId || cluster) {
      if (!clusterIdFilter) return res.json([]);
      q.clusters = clusterIdFilter;
    }
    if (section) q.sections = String(section);

    if (completed !== undefined) {
      q.completed = parseBool(completed);
    } else if (!parseBool(includeCompleted, false)) {
      q.completed = false;
    }

    if (!includeRecurringFlag) {
      q.rrule = { $in: [null, ''] };
    }

    const lim = clamp(limit ?? 200, 1, 1000);
    const off = clamp(offset ?? 0, 0, 1_000_000);

    const sort = { completed: 1, dueDate: 1, createdAt: -1 };
    const items = await Task.find(q).sort(sort).skip(off).limit(lim)
      .populate('clusters', 'name slug icon color')
      .lean();
    res.json(items);
  } catch (e) {
    console.error('[tasks] list failed:', e);
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
    const [dueToday, onYourRadar] = await Promise.all([
      Task.find({ userId, dueDate: { $lte: date }, completed: false, deletedAt: null }).sort({ dueDate: 1 }),
      Task.find({ userId, $or: [{ dueDate: null }, { dueDate: '' }, { dueDate: { $exists: false } }], completed: false, deletedAt: null })
    ]);
    res.json({ dueToday, onYourRadar });
  } catch (e) {
    console.error('[tasks] day list failed:', e);
    res.status(500).json({ error: 'list failed' });
  }
});

function torontoYmd(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const y = parts.find((p) => p.type === 'year')?.value;
  const m = parts.find((p) => p.type === 'month')?.value;
  const d = parts.find((p) => p.type === 'day')?.value;
  return `${y}-${m}-${d}`;
}

function addDaysYmd(iso, days) {
  const [y, m, d] = String(iso).split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1, 12));
  dt.setUTCDate(dt.getUTCDate() + Number(days || 0));
  return torontoYmd(dt);
}

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
      to = addDaysYmd(from, 1);
    } else if (from && !to) {
      to = addDaysYmd(from, 1);
    } else if (!from && to) {
      from = torontoYmd();
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
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
    console.error('[tasks] carry-forward failed:', e);
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

    await created.populate('clusters', 'name slug icon color');
    return res.status(201).json({ ok: true, task: created });
  } catch (e) {
    console.error('[tasks] from-entry failed:', e);
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
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
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
    console.error('[tasks] link-entry failed:', e);
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
    if (req.body?.clusterId !== undefined && up.clusters === undefined) {
      const resolved = await resolveClusterIdForOwner(userId, req.body.clusterId);
      up.clusters = resolved ? [resolved] : [];
    } else if (req.body?.cluster !== undefined && up.clusters === undefined) {
      const resolved = await resolveClusterIdForOwner(userId, req.body.cluster);
      up.clusters = resolved ? [resolved] : [];
    }

    const doc = await Task.findOne({ _id: id, userId });
    if (!doc) return res.status(404).json({ error: 'Not found' });

    if (up.title !== undefined) doc.title = up.title;
    if (up.notes !== undefined) doc.notes = typeof up.notes === 'string' ? up.notes : '';
    if (up.dueDate !== undefined) doc.dueDate = up.dueDate || null;
    if (up.priority !== undefined) doc.priority = Number.isFinite(Number(up.priority)) ? Number(up.priority) : 0;
    if (up.clusters !== undefined) doc.clusters = normalizeClusterIds(up.clusters);
    if (up.sections !== undefined) doc.sections = Array.isArray(up.sections) ? up.sections : [];
    if (up.rrule !== undefined) doc.rrule = typeof up.rrule === 'string' ? up.rrule : '';
    if (up.completed !== undefined) doc.completed = !!up.completed;
    if (up.status !== undefined) {
      const allowed = ['todo', 'doing', 'done'];
      if (allowed.includes(String(up.status))) {
        doc.status = String(up.status);
      }
    }

    const saved = await doc.save();
    await saved.populate('clusters', 'name slug icon color');
    res.json(saved);
  } catch (e) {
    console.error('[tasks] update failed:', e);
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

    // Load minimal fields we need for recurrence, but don't save this doc.
    const task = await Task.findOne(
      { _id: id, userId },
      'completed status title notes dueDate priority clusters sections rrule'
    ).lean();
    if (!task) return res.status(404).json({ error: 'Not found' });

    const nowCompleted = !task.completed;

    // Atomic flip WITHOUT running model validation on unrelated fields
    const status = nowCompleted ? 'done' : (task.status === 'done' ? 'todo' : task.status || 'todo');
    const completedAt = nowCompleted ? new Date() : null;
    const updated = await Task.findOneAndUpdate(
      { _id: id, userId },
      { $set: { completed: nowCompleted, status, completedAt } },
      { new: true, runValidators: true }
    ).populate('clusters', 'name slug icon color').lean();

    // If we just completed and it's recurring, spawn the next
    let next = null;
    if (nowCompleted && task.rrule && task.dueDate) {
      const nextDue = nextFromRRule(task.rrule, task.dueDate);
      if (nextDue) {
        const safeTitle = (typeof task.title === 'string' && task.title.trim()) ? task.title.trim() : '(untitled)';
        const safePriority = Number.isFinite(Number(task.priority)) ? Number(task.priority) : 0;
        next = await Task.create({
          userId,
          title: safeTitle,
          notes: task.notes || '',
          dueDate: nextDue,
          priority: safePriority,
          clusters: Array.isArray(task.clusters) ? task.clusters : [],
          sections: Array.isArray(task.sections) ? task.sections : [],
          rrule: task.rrule,
          completed: false,
          status: 'todo',
        });
        await next.populate('clusters', 'name slug icon color');
      }
    }

    return res.json({ task: updated, next });
  } catch (e) {
    console.error('[tasks] toggle failed:', e);
    return res.status(500).json({ error: 'toggle failed' });
  }
});

// POST /api/tasks (create)
router.post('/', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    let { title, notes, dueDate, priority = 0, clusters = [], sections = [], rrule = '', status = 'todo' } = req.body || {};
    title = typeof title === 'string' ? title.trim() : '';
    if (!title) return res.status(400).json({ error: 'title required' });

    const allowedStatuses = ['todo', 'doing', 'done'];
    const safeStatus = allowedStatuses.includes(status) ? status : 'todo';

    let clusterIds = normalizeClusterIds(clusters);
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
      dueDate,
      priority,
      clusters: clusterIds,
      sections: sections || [],
      rrule,
      completed: false,
      status: safeStatus === 'done' ? 'done' : safeStatus,
    });
    await doc.populate('clusters', 'name slug icon color');
    res.status(201).json(doc);
  } catch (e) {
    // validation stays 400; everything else 500
    const code = e?.name === 'ValidationError' ? 400 : 500;
    console.error('[tasks] create failed:', e);
    res.status(code).json({ error: e?.message || 'create failed' });
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
    console.error('[tasks] delete failed:', e);
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
    console.error('[tasks] bulk-delete failed:', e);
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
function nextWeekdayFrom(iso, targetDow) {
  const d = new Date(`${iso}T12:00:00Z`);
  const cur = d.getUTCDay();
  let delta = (targetDow - cur + 7) % 7;
  if (delta === 0) delta = 7;
  d.setUTCDate(d.getUTCDate() + delta);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function nextFromRRule(rrule, fromISO) {
  if (!rrule || !fromISO) return '';
  const parts = Object.fromEntries(rrule.split(';').map(s => s.split('=')));
  const FREQ = parts.FREQ;
  const INTERVAL = Math.max(1, parseInt(parts.INTERVAL || '1', 10));
  if (FREQ === 'DAILY') return addDaysISO(fromISO, INTERVAL);
  if (FREQ === 'WEEKLY') {
    const by = (parts.BYDAY || '').split(',').filter(Boolean);
    if (by.length === 0) return addDaysISO(fromISO, 7 * INTERVAL);
    const options = by.map(code => nextWeekdayFrom(fromISO, DOW[code]));
    options.sort();
    return options[0];
  }
  if (FREQ === 'MONTHLY') {
    // naive: next month same day
    const [Y, M, D] = fromISO.split('-').map(Number);
    const d = new Date(Date.UTC(Y, M - 1 + INTERVAL, D));
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  return '';
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

    const result = await Task.updateMany(
      { _id: { $in: ids }, userId },
      { $set: { completed: true, status: 'done', completedAt: new Date() } }
    );

    res.json({ ok: true, modified: result.modifiedCount });
  } catch (e) {
    console.error('[tasks] bulk complete failed:', e);
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
    console.error('[tasks] bulk delete failed:', e);
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
    console.error('[tasks] bulk move failed:', e);
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
    .populate('clusters', 'name slug icon color')
    .lean();

    res.json(tasks);
  } catch (e) {
    console.error('[tasks] trash list failed:', e);
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
    ).populate('clusters', 'name slug icon color');

    if (!doc) return res.status(404).json({ error: 'Not found or not deleted' });
    res.json({ ok: true, task: doc });
  } catch (e) {
    console.error('[tasks] restore failed:', e);
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
    console.error('[tasks] permanent delete failed:', e);
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
    console.error('[tasks] empty trash failed:', e);
    res.status(500).json({ error: 'empty trash failed' });
  }
});

export default router;
