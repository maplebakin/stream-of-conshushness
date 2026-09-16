// routes/export.js
// Data export functionality - allows users to export all their data

import express from 'express';
import User from '../models/User.js';
import Entry from '../models/Entry.js';
import Task from '../models/Task.js';
import Goal from '../models/Goal.js';
import Note from '../models/Note.js';
import Habit from '../models/Habit.js';
import Cluster from '../models/Cluster.js';
import Section from '../models/Section.js';
import SectionPage from '../models/SectionPage.js';
import Appointment from '../models/Appointment.js';
import ImportantEvent from '../models/ImportantEvent.js';
import Ripple from '../models/Ripple.js';
import Game from '../models/Game.js';
import GameNote from '../models/GameNote.js';
import GatherItem from '../models/GatherItem.js';
import Interest from '../models/Interest.js';
import ResearchSubject from '../models/ResearchSubject.js';
import ScheduleItem from '../models/ScheduleItem.js';
import SuggestedGatherItem from '../models/SuggestedGatherItem.js';
import SuggestedInterest from '../models/SuggestedInterest.js';
import SuggestedTask from '../models/SuggestedTask.js';
import auth from '../middleware/auth.js';
import { activeEntryQuery } from '../utils/entryQueries.js';
import { logSafeError } from '../utils/errorHandler.js';

const router = express.Router();
router.use(auth);

function getUserId(req) {
  return req.user?.userId || req.user?._id || req.user?.id || null;
}

const exportDatasets = [
  { key: 'entries', model: Entry, query: (userId) => activeEntryQuery(userId) },
  { key: 'tasks', model: Task, query: (userId) => ({ userId }) },
  { key: 'goals', model: Goal, query: (userId) => ({ userId }) },
  { key: 'notes', model: Note, query: (userId) => ({ userId }) },
  { key: 'habits', model: Habit, query: (userId) => ({ userId }) },
  { key: 'clusters', model: Cluster, query: (userId) => ({ ownerId: userId }) },
  { key: 'sections', model: Section, query: (userId) => ({ ownerId: userId }) },
  { key: 'sectionPages', model: SectionPage, query: (userId) => ({ userId }) },
  { key: 'appointments', model: Appointment, query: (userId) => ({ userId }) },
  { key: 'importantEvents', model: ImportantEvent, query: (userId) => ({ userId }) },
  { key: 'ripples', model: Ripple, query: (userId) => ({ userId }) },
  { key: 'suggestedTasks', model: SuggestedTask, query: (userId) => ({ userId }) },
  { key: 'gatherItems', model: GatherItem, query: (userId) => ({ userId }) },
  { key: 'suggestedGatherItems', model: SuggestedGatherItem, query: (userId) => ({ userId }) },
  { key: 'interests', model: Interest, query: (userId) => ({ userId }) },
  { key: 'suggestedInterests', model: SuggestedInterest, query: (userId) => ({ userId }) },
  { key: 'researchSubjects', model: ResearchSubject, query: (userId) => ({ userId }) },
  { key: 'games', model: Game, query: (userId) => ({ userId }) },
  { key: 'gameNotes', model: GameNote, query: (userId) => ({ userId }) },
  { key: 'scheduleItems', model: ScheduleItem, query: (userId) => ({ userId }) },
];

function totalKeyFor(datasetKey) {
  return `total${datasetKey.charAt(0).toUpperCase()}${datasetKey.slice(1)}`;
}

async function countExportDatasets(userId) {
  const pairs = await Promise.all(exportDatasets.map(async (dataset) => [
    dataset.key,
    await dataset.model.countDocuments(dataset.query(userId)),
  ]));
  return Object.fromEntries(pairs);
}

function buildJsonStatistics(counts) {
  return Object.fromEntries(
    exportDatasets.map((dataset) => [totalKeyFor(dataset.key), counts[dataset.key] || 0])
  );
}

function buildDisplayStatistics(counts) {
  const stats = Object.fromEntries(
    exportDatasets.map((dataset) => [dataset.key, counts[dataset.key] || 0])
  );
  stats.total = Object.values(stats).reduce((sum, count) => sum + count, 0);
  return stats;
}

async function fetchExportDatasets(userId) {
  const pairs = await Promise.all(exportDatasets.map(async (dataset) => [
    dataset.key,
    await dataset.model.find(dataset.query(userId)).lean(),
  ]));
  return Object.fromEntries(pairs);
}

async function streamArray(res, cursor) {
  let first = true;
  for await (const doc of cursor) {
    const payload = JSON.stringify(doc);
    res.write(first ? payload : `,${payload}`);
    first = false;
  }
}

function sanitizeCsvValue(value) {
  const raw = value == null ? "" : String(value);
  const trimmed = raw.replace(/^\s+/, "");
  const needsGuard = /^[=+\-@]/.test(trimmed);
  return needsGuard ? `'${raw}` : raw;
}

function csvCell(value) {
  const safe = sanitizeCsvValue(value);
  return `"${safe.replace(/"/g, '""')}"`;
}

function sanitizeCsvField(value) {
  const str = (value ?? '').toString();
  const withoutNewlines = str.replace(/[\r\n]+/g, ' ');
  if (/^[=+\-@]/.test(withoutNewlines)) {
    return `'${withoutNewlines}`;
  }
  return withoutNewlines;
}

/**
 * GET /api/export/json
 * Export all user data as JSON
 */
router.get('/json', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const stream = String(req.query.stream ?? '1') !== '0' && typeof res.write === 'function';

    if (stream) {
      const [user, counts] = await Promise.all([
        User.findById(userId)
          .select('_id username email isAdmin profilePicture createdAt updatedAt emailVerifiedAt')
          .lean(),
        countExportDatasets(userId),
      ]);
      const statistics = buildJsonStatistics(counts);

      // Set headers for download
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="streamofconshushness-export-${Date.now()}.json"`);

      res.write('{');
      res.write(`"exportedAt":${JSON.stringify(new Date().toISOString())},`);
      res.write('"version":"1.0",');
      res.write(`"user":${JSON.stringify(user || {})},`);
      res.write('"data":{');

      for (let i = 0; i < exportDatasets.length; i += 1) {
        const dataset = exportDatasets[i];
        if (i > 0) res.write(',');
        res.write(`${JSON.stringify(dataset.key)}:[`);
        await streamArray(res, dataset.model.find(dataset.query(userId)).lean().cursor());
        res.write(']');
      }

      res.write('},');
      res.write(`"statistics":${JSON.stringify(statistics)}`);
      res.write('}');
      return res.end();
    }

    const [user, data] = await Promise.all([
      User.findById(userId)
        .select('_id username email isAdmin profilePicture createdAt updatedAt emailVerifiedAt')
        .lean(),
      fetchExportDatasets(userId),
    ]);
    const counts = Object.fromEntries(
      exportDatasets.map((dataset) => [dataset.key, data[dataset.key]?.length || 0])
    );

    const exportData = {
      exportedAt: new Date().toISOString(),
      version: '1.0',
      user: user || {},
      data,
      statistics: buildJsonStatistics(counts)
    };

    // Set headers for download
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="streamofconshushness-export-${Date.now()}.json"`);

    res.json(exportData);
  } catch (error) {
    logSafeError('export JSON failed', error);
    if (res.headersSent) {
      return res.end();
    }
    res.status(500).json({ error: 'Export failed' });
  }
});

/**
 * GET /api/export/csv/entries
 * Export entries as CSV
 */
router.get('/csv/entries', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const entries = await Entry.find(activeEntryQuery(userId)).sort({ date: -1 }).lean();

    // CSV header
    const headers = ['Date', 'Text', 'Mood', 'Tags', 'Pinned', 'Created At'];
    const csvRows = [headers.join(',')];

    // CSV rows
    for (const entry of entries) {
      const sanitizedText = sanitizeCsvField(entry.text || entry.content || '');
      const sanitizedMood = sanitizeCsvField(entry.mood || '');
      const sanitizedTags = sanitizeCsvField((entry.tags || []).join(', '));

      const row = [
        entry.date || '',
        `"${sanitizedText.replace(/"/g, '""')}"`,
        sanitizedMood,
        `"${sanitizedTags.replace(/"/g, '""')}"`,
        entry.pinned ? 'Yes' : 'No',
        entry.createdAt ? new Date(entry.createdAt).toISOString() : '',
      ];
      csvRows.push(row.join(','));
    }

    const csv = csvRows.join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="entries-export-${Date.now()}.csv"`);
    res.send(csv);
  } catch (error) {
    logSafeError('export CSV entries failed', error);
    res.status(500).json({ error: 'Export failed' });
  }
});

/**
 * GET /api/export/csv/tasks
 * Export tasks as CSV
 */
router.get('/csv/tasks', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const tasks = await Task.find({ userId }).sort({ dueDate: 1 }).lean();

    // CSV header
    const headers = ['Title', 'Status', 'Completed', 'Due Date', 'Priority', 'Notes', 'Created At', 'Completed At'];
    const csvRows = [headers.join(',')];

    // CSV rows
    for (const task of tasks) {
      const row = [
        csvCell(task.title || ""),
        csvCell(task.status || "todo"),
        csvCell(task.completed ? "Yes" : "No"),
        csvCell(task.dueDate || ""),
        csvCell(task.priority ?? ""),
        csvCell(task.notes || ""),
        csvCell(task.createdAt ? new Date(task.createdAt).toISOString() : ""),
        csvCell(task.completedAt ? new Date(task.completedAt).toISOString() : "")
      ];
      csvRows.push(row.join(','));
    }

    const csv = csvRows.join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="tasks-export-${Date.now()}.csv"`);
    res.send(csv);
  } catch (error) {
    logSafeError('export CSV tasks failed', error);
    res.status(500).json({ error: 'Export failed' });
  }
});

/**
 * GET /api/export/csv/goals
 * Export goals as CSV
 */
router.get('/csv/goals', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const goals = await Goal.find({ userId }).sort({ createdAt: -1 }).lean();

    // CSV header
    const headers = ['Title', 'Description', 'Steps', 'Created At'];
    const csvRows = [headers.join(',')];

    // CSV rows
    for (const goal of goals) {
      const stepsText = (goal.steps || [])
        .map(s => `${s.completed ? '[x]' : '[ ]'} ${s.content}`)
        .join('; ');

      const row = [
        csvCell(goal.title || ""),
        csvCell(goal.description || ""),
        csvCell(stepsText),
        csvCell(goal.createdAt ? new Date(goal.createdAt).toISOString() : "")
      ];
      csvRows.push(row.join(','));
    }

    const csv = csvRows.join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="goals-export-${Date.now()}.csv"`);
    res.send(csv);
  } catch (error) {
    logSafeError('export CSV goals failed', error);
    res.status(500).json({ error: 'Export failed' });
  }
});

/**
 * GET /api/export/statistics
 * Get user data statistics (for display before export)
 */
router.get('/statistics', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const counts = await countExportDatasets(userId);
    res.json(buildDisplayStatistics(counts));
  } catch (error) {
    logSafeError('export statistics failed', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

export default router;
