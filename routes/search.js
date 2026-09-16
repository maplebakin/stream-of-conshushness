// routes/search.js
// Global search across all user content

import express from 'express';
import Entry from '../models/Entry.js';
import Task from '../models/Task.js';
import Goal from '../models/Goal.js';
import Note from '../models/Note.js';
import Section from '../models/Section.js';
import SectionPage from '../models/SectionPage.js';
import Cluster from '../models/Cluster.js';
import Appointment from '../models/Appointment.js';
import Game from '../models/Game.js';
import GameNote from '../models/GameNote.js';
import GatherItem from '../models/GatherItem.js';
import Habit from '../models/Habit.js';
import ImportantEvent from '../models/ImportantEvent.js';
import Interest from '../models/Interest.js';
import ResearchSubject from '../models/ResearchSubject.js';
import ScheduleItem from '../models/ScheduleItem.js';
import SuggestedGatherItem from '../models/SuggestedGatherItem.js';
import SuggestedInterest from '../models/SuggestedInterest.js';
import SuggestedTask from '../models/SuggestedTask.js';
import { activeEntryQuery } from '../utils/entryQueries.js';
import { logSafeError } from '../utils/errorHandler.js';
import { resolveSourceEntries, sourceEntryMeta, sourceIdsFrom } from '../utils/sourceEntryState.js';

const router = express.Router();

function getUserId(req) {
  return req.user?.userId || req.user?._id || req.user?.id || null;
}

function escapeRegex(text) {
  return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
}

function includesType(type, ...names) {
  return type === 'all' || names.includes(type);
}

function idOf(value) {
  if (!value) return '';
  if (typeof value === 'object' && value._id) return String(value._id);
  return String(value);
}

function isoDate(value) {
  if (!value) return '';
  if (typeof value === 'string') {
    const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : '';
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  return '';
}

function sourceRippleMeta(ripple) {
  if (!ripple || typeof ripple !== 'object') return {};
  return {
    sourceRippleId: idOf(ripple),
    sourceEntryId: idOf(ripple.entryId),
    sourceDate: isoDate(ripple.dateKey),
    sourceText: ripple.text || '',
  };
}

/**
 * GET /api/search?q=query&type=all&limit=50
 * Global search across all content types
 */
router.get('/', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { q, type = 'all', limit = 50 } = req.query;

    if (!q || q.trim().length < 2) {
      return res.status(400).json({ error: 'Search query must be at least 2 characters' });
    }

    const query = q.trim();
    const searchLimit = Math.min(parseInt(limit) || 50, 200);

    // Build regex pattern for case-insensitive search
    const searchPattern = new RegExp(escapeRegex(query), 'i');

    const results = {
      query,
      entries: [],
      tasks: [],
      goals: [],
      notes: [],
      sections: [],
      sectionPages: [],
      clusters: [],
      appointments: [],
      importantEvents: [],
      gatherItems: [],
      suggestedGatherItems: [],
      interests: [],
      suggestedInterests: [],
      suggestedTasks: [],
      habits: [],
      researchSubjects: [],
      games: [],
      gameNotes: [],
      scheduleItems: [],
      total: 0
    };

    // Search entries
    if (includesType(type, 'entries')) {
      const entries = await Entry.find({
        ...activeEntryQuery(userId),
        $or: [
          { text: searchPattern },
          { html: searchPattern },
          { content: searchPattern },
          { tags: searchPattern }
        ]
      })
        .sort({ date: -1 })
        .limit(searchLimit)
        .select('date text html content mood tags pinned createdAt')
        .lean();

      results.entries = entries.map(e => ({
        ...e,
        type: 'entry',
        preview: getPreview(e.text || e.content || stripHtml(e.html), query)
      }));
    }

    // Search tasks
    if (includesType(type, 'tasks')) {
      const tasks = await Task.find({
        userId,
        deletedAt: null,
        $or: [
          { title: searchPattern },
          { notes: searchPattern }
        ]
      })
        .sort({ createdAt: -1 })
        .limit(searchLimit)
        .select('title notes status completed dueDate priority entryId createdAt')
        .lean();

      const sourceMap = await resolveSourceEntries({
        userId,
        sourceIds: sourceIdsFrom(tasks, (item) => item.entryId),
      });

      results.tasks = tasks.map(t => ({
        ...t,
        type: 'task',
        preview: getPreview(t.title + ' ' + (t.notes || ''), query),
        ...sourceEntryMeta(sourceMap, t.entryId),
      }));
    }

    // Search goals
    if (includesType(type, 'goals')) {
      const goals = await Goal.find({
        userId,
        $or: [
          { title: searchPattern },
          { description: searchPattern }
        ]
      })
        .sort({ createdAt: -1 })
        .limit(searchLimit)
        .select('title description steps createdAt')
        .lean();

      results.goals = goals.map(g => ({
        ...g,
        type: 'goal',
        preview: getPreview(g.title + ' ' + (g.description || ''), query)
      }));
    }

    // Search notes
    if (includesType(type, 'notes')) {
      const notes = await Note.find({
        userId,
        content: searchPattern
      })
        .sort({ date: -1 })
        .limit(searchLimit)
        .select('date content clusters createdAt')
        .lean();

      results.notes = notes.map(n => ({
        ...n,
        type: 'note',
        preview: getPreview(n.content, query)
      }));
    }

    // Search sections
    if (includesType(type, 'sections')) {
      const sections = await Section.find({
        ownerId: userId,
        $or: [
          { title: searchPattern },
          { description: searchPattern }
        ]
      })
        .sort({ createdAt: -1 })
        .limit(searchLimit)
        .select('title slug description icon layout createdAt')
        .lean();

      results.sections = sections.map(s => ({
        ...s,
        type: 'section',
        preview: getPreview((s.title || '') + ' ' + (s.description || ''), query)
      }));
    }

    // Search section pages
    if (includesType(type, 'sectionPages')) {
      const pages = await SectionPage.find({
        userId,
        $or: [
          { title: searchPattern },
          { body: searchPattern }
        ]
      })
        .sort({ createdAt: -1 })
        .limit(searchLimit)
        .select('title slug sectionKey body createdAt')
        .lean();

      results.sectionPages = pages.map(p => ({
        ...p,
        type: 'sectionPage',
        preview: getPreview((p.title || '') + ' ' + (p.body || ''), query)
      }));
    }

    // Search clusters
    if (includesType(type, 'clusters')) {
      const clusters = await Cluster.find({
        ownerId: userId,
        name: searchPattern
      })
        .sort({ createdAt: 1 })
        .limit(searchLimit)
        .select('name slug color icon createdAt')
        .lean();

      results.clusters = clusters.map(c => ({
        ...c,
        type: 'cluster'
      }));
    }

    if (includesType(type, 'appointments')) {
      const appointments = await Appointment.find({
        userId,
        automationReviewStatus: { $nin: ['pending', 'dismissed'] },
        scheduleStatus: { $ne: 'cancelled' },
        $or: [
          { title: searchPattern },
          { details: searchPattern },
          { location: searchPattern }
        ]
      })
        .sort({ date: -1, createdAt: -1 })
        .limit(searchLimit)
        .select('title details location date startDate timeStart timeEnd entryId source createdAt')
        .lean();

      const sourceMap = await resolveSourceEntries({
        userId,
        sourceIds: sourceIdsFrom(appointments, (item) => item.entryId),
      });

      results.appointments = appointments.map((item) => ({
        ...item,
        type: 'appointment',
        preview: getPreview(`${item.details || ''} ${item.location || ''}`, query),
        ...sourceEntryMeta(sourceMap, item.entryId),
        source: item.source || ''
      }));
    }

    if (includesType(type, 'importantEvents', 'events')) {
      const importantEvents = await ImportantEvent.find({
        userId,
        automationReviewStatus: { $nin: ['pending', 'dismissed'] },
        $or: [
          { title: searchPattern },
          { description: searchPattern }
        ]
      })
        .sort({ date: -1, createdAt: -1 })
        .limit(searchLimit)
        .select('title description date pinned entryId source createdAt')
        .lean();

      const sourceMap = await resolveSourceEntries({
        userId,
        sourceIds: sourceIdsFrom(importantEvents, (item) => item.entryId),
      });

      results.importantEvents = importantEvents.map((item) => ({
        ...item,
        type: 'importantEvent',
        preview: getPreview(item.description || '', query),
        ...sourceEntryMeta(sourceMap, item.entryId),
        source: item.source || ''
      }));
    }

    if (includesType(type, 'gatherItems', 'gather')) {
      const gatherItems = await GatherItem.find({
        userId,
        $or: [
          { title: searchPattern },
          { description: searchPattern },
          { sourceText: searchPattern },
          { list: searchPattern },
          { tags: searchPattern }
        ]
      })
        .sort({ createdAt: -1 })
        .limit(searchLimit)
        .select('title description list status sourceText tags sourceEntryId createdAt')
        .lean();

      const sourceMap = await resolveSourceEntries({
        userId,
        sourceIds: sourceIdsFrom(gatherItems, (item) => item.sourceEntryId),
      });

      results.gatherItems = gatherItems.map((item) => {
        const source = sourceEntryMeta(sourceMap, item.sourceEntryId);
        const sourceText = source.sourceState && !source.sourceAvailable ? '' : item.sourceText || '';
        return {
          ...item,
          type: 'gatherItem',
          sourceText,
          preview: getPreview(`${item.description || ''} ${sourceText} ${item.list || ''}`, query),
          ...source,
        };
      });
    }

    if (includesType(type, 'suggestedGatherItems')) {
      const suggestedGatherItems = await SuggestedGatherItem.find({
        userId,
        status: { $in: ['pending', 'accepting'] },
        $or: [
          { title: searchPattern },
          { description: searchPattern },
          { sourceText: searchPattern },
          { list: searchPattern },
          { tags: searchPattern }
        ]
      })
        .sort({ createdAt: -1 })
        .limit(searchLimit)
        .select('title description list status sourceText tags sourceEntryId createdAt')
        .lean();

      const sourceMap = await resolveSourceEntries({
        userId,
        sourceIds: sourceIdsFrom(suggestedGatherItems, (item) => item.sourceEntryId),
      });

      results.suggestedGatherItems = suggestedGatherItems.map((item) => {
        const source = sourceEntryMeta(sourceMap, item.sourceEntryId);
        const sourceText = source.sourceState && !source.sourceAvailable ? '' : item.sourceText || '';
        return {
          ...item,
          type: 'suggestedGatherItem',
          sourceText,
          preview: getPreview(`${item.description || ''} ${sourceText} ${item.list || ''}`, query),
          ...source,
        };
      });
    }

    if (includesType(type, 'interests')) {
      const interests = await Interest.find({
        userId,
        $or: [
          { title: searchPattern },
          { description: searchPattern },
          { sourceText: searchPattern },
          { category: searchPattern },
          { tags: searchPattern }
        ]
      })
        .sort({ createdAt: -1 })
        .limit(searchLimit)
        .select('title description category status sourceText tags sourceEntryId createdAt')
        .lean();

      const sourceMap = await resolveSourceEntries({
        userId,
        sourceIds: sourceIdsFrom(interests, (item) => item.sourceEntryId),
      });

      results.interests = interests.map((item) => {
        const source = sourceEntryMeta(sourceMap, item.sourceEntryId);
        const sourceText = source.sourceState && !source.sourceAvailable ? '' : item.sourceText || '';
        return {
          ...item,
          type: 'interest',
          sourceText,
          preview: getPreview(`${item.description || ''} ${sourceText} ${item.category || ''}`, query),
          ...source,
        };
      });
    }

    if (includesType(type, 'suggestedInterests')) {
      const suggestedInterests = await SuggestedInterest.find({
        userId,
        status: { $in: ['pending', 'accepting'] },
        $or: [
          { title: searchPattern },
          { description: searchPattern },
          { sourceText: searchPattern },
          { category: searchPattern },
          { tags: searchPattern }
        ]
      })
        .sort({ createdAt: -1 })
        .limit(searchLimit)
        .select('title description category status sourceText tags sourceEntryId createdAt')
        .lean();

      const sourceMap = await resolveSourceEntries({
        userId,
        sourceIds: sourceIdsFrom(suggestedInterests, (item) => item.sourceEntryId),
      });

      results.suggestedInterests = suggestedInterests.map((item) => {
        const source = sourceEntryMeta(sourceMap, item.sourceEntryId);
        const sourceText = source.sourceState && !source.sourceAvailable ? '' : item.sourceText || '';
        return {
          ...item,
          type: 'suggestedInterest',
          sourceText,
          preview: getPreview(`${item.description || ''} ${sourceText} ${item.category || ''}`, query),
          ...source,
        };
      });
    }

    if (includesType(type, 'suggestedTasks')) {
      const suggestedTasks = await SuggestedTask.find({
        userId,
        status: { $in: ['pending', 'accepting', 'rejecting'] },
        title: searchPattern
      })
        .sort({ createdAt: -1 })
        .limit(searchLimit)
        .select('title status priority dueDate repeat cluster section sourceRippleId createdAt')
        .populate({
          path: 'sourceRippleId',
          select: 'entryId dateKey text',
          match: { userId },
        })
        .lean();

      const sourceMap = await resolveSourceEntries({
        userId,
        sourceIds: sourceIdsFrom(suggestedTasks, (item) => item?.sourceRippleId?.entryId),
      });
      results.suggestedTasks = suggestedTasks.map((item) => {
        const ripple = sourceRippleMeta(item.sourceRippleId);
        const source = sourceEntryMeta(sourceMap, ripple.sourceEntryId);
        return {
          ...item,
          type: 'suggestedTask',
          dueDate: isoDate(item.dueDate),
          preview: getPreview(`${item.priority || ''} ${item.cluster || ''} ${item.section || ''}`, query),
          ...ripple,
          ...source,
          sourceText: source.sourceState && !source.sourceAvailable ? '' : ripple.sourceText,
        };
      });
    }

    if (includesType(type, 'habits')) {
      const habits = await Habit.find({
        userId,
        $or: [
          { title: searchPattern },
          { cluster: searchPattern },
          { repeat: searchPattern }
        ]
      })
        .sort({ createdAt: -1 })
        .limit(searchLimit)
        .select('title cluster repeat history createdAt')
        .lean();

      results.habits = habits.map((item) => ({
        ...item,
        type: 'habit',
        status: item.repeat || '',
        preview: getPreview(`${item.cluster || ''} ${item.repeat || ''}`, query)
      }));
    }

    if (includesType(type, 'researchSubjects', 'research')) {
      const researchSubjects = await ResearchSubject.find({
        userId,
        $or: [
          { name: searchPattern },
          { alternateNames: searchPattern },
          { notes: searchPattern },
          { birthPlace: searchPattern },
          { deathPlace: searchPattern },
          { burialPlace: searchPattern },
          { occupation: searchPattern },
          { tags: searchPattern },
          { 'sources.citation': searchPattern },
          { 'sources.url': searchPattern }
        ]
      })
        .sort({ updatedAt: -1, createdAt: -1 })
        .limit(searchLimit)
        .select('name slug sectionId notes birthDate deathDate birthPlace deathPlace occupation tags updatedAt createdAt')
        .lean();

      const sectionIds = [...new Set(researchSubjects.map((item) => idOf(item.sectionId)).filter(Boolean))];
      const researchSections = sectionIds.length
        ? await Section.find({ ownerId: userId, _id: { $in: sectionIds } }).select('_id slug').lean()
        : [];
      const sectionSlugs = new Map(researchSections.map((section) => [idOf(section), section.slug]));

      results.researchSubjects = researchSubjects.map((item) => ({
        ...item,
        type: 'researchSubject',
        sectionSlug: sectionSlugs.get(idOf(item.sectionId)) || '',
        preview: getPreview(`${item.notes || ''} ${item.birthPlace || ''} ${item.deathPlace || ''} ${item.occupation || ''}`, query)
      }));
    }

    if (includesType(type, 'games')) {
      const games = await Game.find({
        userId,
        $or: [
          { title: searchPattern },
          { description: searchPattern }
        ]
      })
        .sort({ createdAt: -1 })
        .limit(searchLimit)
        .select('title slug description imageUrl createdAt')
        .lean();

      results.games = games.map((item) => ({
        ...item,
        type: 'game',
        preview: getPreview(item.description || '', query)
      }));
    }

    if (includesType(type, 'gameNotes')) {
      const gameNotes = await GameNote.find({
        userId,
        content: searchPattern
      })
        .sort({ updatedAt: -1 })
        .limit(searchLimit)
        .select('gameId content updatedAt')
        .lean();

      results.gameNotes = gameNotes.map((item) => ({
        ...item,
        type: 'gameNote',
        preview: getPreview(item.content || '', query)
      }));
    }

    if (includesType(type, 'scheduleItems', 'schedule')) {
      const scheduleItems = await ScheduleItem.find({
        userId,
        text: searchPattern
      })
        .sort({ date: -1, hour: 1 })
        .limit(searchLimit)
        .select('date hour text createdAt')
        .lean();

      results.scheduleItems = scheduleItems.map((item) => ({
        ...item,
        type: 'scheduleItem',
        title: item.text || 'Scheduled item',
        preview: getPreview(`${item.date || ''} ${item.hour || ''} ${item.text || ''}`, query)
      }));
    }

    // Calculate total results
    results.total = Object.entries(results)
      .filter(([key, value]) => key !== 'query' && Array.isArray(value))
      .reduce((sum, [, value]) => sum + value.length, 0);

    res.json(results);
  } catch (error) {
    logSafeError('search failed', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

/**
 * Helper: Generate preview snippet with highlighted search term
 */
function getPreview(text, query, maxLength = 150) {
  if (!text) return '';

  // Strip HTML tags
  const cleanText = stripHtml(text);

  // Find the position of the search term (case insensitive)
  const lowerText = cleanText.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const index = lowerText.indexOf(lowerQuery);

  if (index === -1) {
    // Query not found in text, return beginning
    return cleanText.substring(0, maxLength) + (cleanText.length > maxLength ? '...' : '');
  }

  // Calculate start position to center the query
  const start = Math.max(0, index - Math.floor(maxLength / 2));
  const end = Math.min(cleanText.length, start + maxLength);

  let preview = cleanText.substring(start, end);

  // Add ellipsis if truncated
  if (start > 0) preview = '...' + preview;
  if (end < cleanText.length) preview = preview + '...';

  return preview;
}

/**
 * Helper: Strip HTML tags from text
 */
function stripHtml(html) {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

export default router;
