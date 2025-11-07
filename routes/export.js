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

const router = express.Router();

function getUserId(req) {
  return req.user?.userId || req.user?._id || req.user?.id || null;
}

/**
 * GET /api/export/json
 * Export all user data as JSON
 */
router.get('/json', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

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
      User.findById(userId).select('-passwordHash -resetTokenHash -emailVerifyCodeHash').lean(),
      Entry.find({ userId }).lean(),
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
        totalAppointments: appointments.length
      }
    };

    // Set headers for download
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="streamofconshushness-export-${Date.now()}.json"`);

    res.json(exportData);
  } catch (error) {
    console.error('[export] JSON export failed:', error);
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

    const entries = await Entry.find({ userId }).sort({ date: -1 }).lean();

    // CSV header
    const headers = ['Date', 'Text', 'Mood', 'Tags', 'Pinned', 'Created At'];
    const csvRows = [headers.join(',')];

    // CSV rows
    for (const entry of entries) {
      const row = [
        entry.date || '',
        `"${(entry.text || entry.content || '').replace(/"/g, '""')}"`, // Escape quotes
        entry.mood || '',
        `"${(entry.tags || []).join(', ')}"`,
        entry.pinned ? 'Yes' : 'No',
        entry.createdAt ? new Date(entry.createdAt).toISOString() : ''
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
        `"${(task.title || '').replace(/"/g, '""')}"`,
        task.status || 'todo',
        task.completed ? 'Yes' : 'No',
        task.dueDate || '',
        task.priority || '',
        `"${(task.notes || '').replace(/"/g, '""')}"`,
        task.createdAt ? new Date(task.createdAt).toISOString() : '',
        task.completedAt ? new Date(task.completedAt).toISOString() : ''
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
        `"${(goal.title || '').replace(/"/g, '""')}"`,
        `"${(goal.description || '').replace(/"/g, '""')}"`,
        `"${stepsText.replace(/"/g, '""')}"`,
        goal.createdAt ? new Date(goal.createdAt).toISOString() : ''
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
      Entry.countDocuments({ userId }),
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
