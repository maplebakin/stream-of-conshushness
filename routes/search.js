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

const router = express.Router();

function getUserId(req) {
  return req.user?.userId || req.user?._id || req.user?.id || null;
}

function escapeRegex(text) {
  return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
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
      total: 0
    };

    // Search entries
    if (type === 'all' || type === 'entries') {
      const entries = await Entry.find({
        userId,
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
    if (type === 'all' || type === 'tasks') {
      const tasks = await Task.find({
        userId,
        $or: [
          { title: searchPattern },
          { notes: searchPattern }
        ]
      })
        .sort({ createdAt: -1 })
        .limit(searchLimit)
        .select('title notes status completed dueDate priority createdAt')
        .lean();

      results.tasks = tasks.map(t => ({
        ...t,
        type: 'task',
        preview: getPreview(t.title + ' ' + (t.notes || ''), query)
      }));
    }

    // Search goals
    if (type === 'all' || type === 'goals') {
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
    if (type === 'all' || type === 'notes') {
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
    if (type === 'all' || type === 'sections') {
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
    if (type === 'all' || type === 'sectionPages') {
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
    if (type === 'all' || type === 'clusters') {
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

    // Calculate total results
    results.total =
      results.entries.length +
      results.tasks.length +
      results.goals.length +
      results.notes.length +
      results.sections.length +
      results.sectionPages.length +
      results.clusters.length;

    res.json(results);
  } catch (error) {
    console.error('[search] Search failed:', error);
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
