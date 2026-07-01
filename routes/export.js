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
import auth from '../middleware/auth.js';
import { activeEntryQuery } from '../utils/entryQueries.js';

const router = express.Router();
router.use(auth);

function getUserId(req) {
  return req.user?.userId || req.user?._id || req.user?.id || null;
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
      const [
        user,
        entriesCount,
        tasksCount,
        goalsCount,
        notesCount,
        habitsCount,
        clustersCount,
        sectionsCount,
        sectionPagesCount,
        appointmentsCount,
        importantEventsCount,
        ripplesCount,
      ] = await Promise.all([
        User.findById(userId)
          .select('_id username email isAdmin profilePicture createdAt updatedAt emailVerifiedAt')
          .lean(),
        Entry.countDocuments(activeEntryQuery(userId)),
        Task.countDocuments({ userId }),
        Goal.countDocuments({ userId }),
        Note.countDocuments({ userId }),
        Habit.countDocuments({ userId }),
        Cluster.countDocuments({ ownerId: userId }),
        Section.countDocuments({ ownerId: userId }),
        SectionPage.countDocuments({ userId }),
        Appointment.countDocuments({ userId }),
        ImportantEvent.countDocuments({ userId }),
        Ripple.countDocuments({ userId }),
      ]);

      const statistics = {
        totalEntries: entriesCount,
        totalTasks: tasksCount,
        totalGoals: goalsCount,
        totalNotes: notesCount,
        totalHabits: habitsCount,
        totalClusters: clustersCount,
        totalSections: sectionsCount,
        totalSectionPages: sectionPagesCount,
        totalAppointments: appointmentsCount,
        totalImportantEvents: importantEventsCount,
        totalRipples: ripplesCount,
      };

      // Set headers for download
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="streamofconshushness-export-${Date.now()}.json"`);

      res.write('{');
      res.write(`"exportedAt":${JSON.stringify(new Date().toISOString())},`);
      res.write('"version":"1.0",');
      res.write(`"user":${JSON.stringify(user || {})},`);
      res.write('"data":{');

      res.write('"entries":[');
      await streamArray(res, Entry.find(activeEntryQuery(userId)).lean().cursor());
      res.write('],');

      res.write('"tasks":[');
      await streamArray(res, Task.find({ userId }).lean().cursor());
      res.write('],');

      res.write('"goals":[');
      await streamArray(res, Goal.find({ userId }).lean().cursor());
      res.write('],');

      res.write('"notes":[');
      await streamArray(res, Note.find({ userId }).lean().cursor());
      res.write('],');

      res.write('"habits":[');
      await streamArray(res, Habit.find({ userId }).lean().cursor());
      res.write('],');

      res.write('"clusters":[');
      await streamArray(res, Cluster.find({ ownerId: userId }).lean().cursor());
      res.write('],');

      res.write('"sections":[');
      await streamArray(res, Section.find({ ownerId: userId }).lean().cursor());
      res.write('],');

      res.write('"sectionPages":[');
      await streamArray(res, SectionPage.find({ userId }).lean().cursor());
      res.write('],');

      res.write('"appointments":[');
      await streamArray(res, Appointment.find({ userId }).lean().cursor());
      res.write('],');

      res.write('"importantEvents":[');
      await streamArray(res, ImportantEvent.find({ userId }).lean().cursor());
      res.write('],');

      res.write('"ripples":[');
      await streamArray(res, Ripple.find({ userId }).lean().cursor());
      res.write(']');

      res.write('},');
      res.write(`"statistics":${JSON.stringify(statistics)}`);
      res.write('}');
      return res.end();
    }

    // Fetch all user data
    const [
      user,
      entries,
      tasks,
      goals,
      notes,
      habits,
      clusters,
      sections,
      sectionPages,
      appointments,
      importantEvents,
      ripples
    ] = await Promise.all([
      User.findById(userId)
        .select('_id username email isAdmin profilePicture createdAt updatedAt emailVerifiedAt')
        .lean(),
      Entry.find(activeEntryQuery(userId)).lean(),
      Task.find({ userId }).lean(),
      Goal.find({ userId }).lean(),
      Note.find({ userId }).lean(),
      Habit.find({ userId }).lean(),
      Cluster.find({ ownerId: userId }).lean(),
      Section.find({ ownerId: userId }).lean(),
      SectionPage.find({ userId }).lean(),
      Appointment.find({ userId }).lean(),
      ImportantEvent.find({ userId }).lean(),
      Ripple.find({ userId }).lean()
    ]);

    const exportData = {
      exportedAt: new Date().toISOString(),
      version: '1.0',
      user: user || {},
      data: {
        entries: entries || [],
        tasks: tasks || [],
        goals: goals || [],
        notes: notes || [],
        habits: habits || [],
        clusters: clusters || [],
        sections: sections || [],
        sectionPages: sectionPages || [],
        appointments: appointments || [],
        importantEvents: importantEvents || [],
        ripples: ripples || []
      },
      statistics: {
        totalEntries: entries.length,
        totalTasks: tasks.length,
        totalGoals: goals.length,
        totalNotes: notes.length,
        totalHabits: habits.length,
        totalClusters: clusters.length,
        totalSections: sections.length,
        totalSectionPages: sectionPages.length,
        totalAppointments: appointments.length,
        totalImportantEvents: importantEvents.length,
        totalRipples: ripples.length,
      }
    };

    // Set headers for download
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="streamofconshushness-export-${Date.now()}.json"`);

    res.json(exportData);
  } catch (error) {
    console.error('[export] JSON export failed:', error);
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
    console.error('[export] CSV entries export failed:', error);
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
    console.error('[export] CSV tasks export failed:', error);
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
    console.error('[export] CSV goals export failed:', error);
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

    const [
      entriesCount,
      tasksCount,
      goalsCount,
      notesCount,
      habitsCount,
      clustersCount,
      sectionsCount,
      appointmentsCount
    ] = await Promise.all([
      Entry.countDocuments(activeEntryQuery(userId)),
      Task.countDocuments({ userId }),
      Goal.countDocuments({ userId }),
      Note.countDocuments({ userId }),
      Habit.countDocuments({ userId }),
      Cluster.countDocuments({ ownerId: userId }),
      Section.countDocuments({ ownerId: userId }),
      Appointment.countDocuments({ userId })
    ]);

    res.json({
      entries: entriesCount,
      tasks: tasksCount,
      goals: goalsCount,
      notes: notesCount,
      habits: habitsCount,
      clusters: clustersCount,
      sections: sectionsCount,
      appointments: appointmentsCount,
      total: entriesCount + tasksCount + goalsCount + notesCount + habitsCount + clustersCount + sectionsCount + appointmentsCount
    });
  } catch (error) {
    console.error('[export] Statistics failed:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

export default router;
