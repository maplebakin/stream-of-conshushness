import express from 'express';
import Appointment from '../models/Appointment.js';
import ImportantEvent from '../models/ImportantEvent.js';
import Ripple from '../models/Ripple.js';
import SuggestedGatherItem from '../models/SuggestedGatherItem.js';
import SuggestedInterest from '../models/SuggestedInterest.js';
import SuggestedTask from '../models/SuggestedTask.js';

const router = express.Router();

function getUserId(req) {
  return req.user?.userId || req.user?._id || req.user?.id || null;
}

function clampLimit(value) {
  const parsed = parseInt(value || '200', 10);
  if (Number.isNaN(parsed)) return 200;
  return Math.max(25, Math.min(parsed, 500));
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

function sourceEntryMeta(entry) {
  if (!entry || typeof entry !== 'object') return {};
  return {
    sourceEntryId: idOf(entry),
    sourceDate: isoDate(entry.date),
    sourceTitle: entry.title || '',
  };
}

function sourceRippleMeta(ripple) {
  if (!ripple || typeof ripple !== 'object') return {};
  return {
    sourceRippleId: idOf(ripple),
    sourceDate: isoDate(ripple.dateKey),
    sourceEntryId: idOf(ripple.entryId),
    sourceText: ripple.text || '',
  };
}

function clusterNames(clusters) {
  if (!Array.isArray(clusters)) return [];
  return clusters
    .map((cluster) => (
      typeof cluster === 'string'
        ? cluster
        : cluster?.name || cluster?.label || cluster?.slug || ''
    ))
    .filter(Boolean);
}

function sortReviewItems(a, b) {
  const dateA = a.sourceDate || a.date || a.dueDate || '9999-12-31';
  const dateB = b.sourceDate || b.date || b.dueDate || '9999-12-31';
  if (dateA !== dateB) return dateA.localeCompare(dateB);
  return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
}

function taskSuggestionItem(item) {
  const source = sourceRippleMeta(item.sourceRippleId);
  return {
    id: idOf(item),
    kind: 'suggestedTask',
    group: 'tasks',
    title: item.title || item.text || 'Untitled task suggestion',
    status: item.status || 'pending',
    dueDate: isoDate(item.dueDate),
    priority: item.priority || 'low',
    repeat: item.repeat || item.rrule || '',
    createdAt: item.createdAt || '',
    meta: [
      item.priority ? `Priority: ${item.priority}` : '',
      isoDate(item.dueDate) ? `Due ${isoDate(item.dueDate)}` : '',
      item.repeat || item.rrule ? 'Repeats' : '',
    ].filter(Boolean),
    ...source,
  };
}

function gatherSuggestionItem(item) {
  const source = sourceEntryMeta(item.sourceEntryId);
  const clusters = clusterNames(item.clusters);
  return {
    id: idOf(item),
    kind: 'suggestedGatherItem',
    group: 'gather',
    title: item.title || 'Untitled gather suggestion',
    status: item.status || 'pending',
    sourceText: item.sourceText || '',
    createdAt: item.createdAt || '',
    meta: [
      item.list || 'Things to Buy',
      ...clusters,
      item.reason || '',
    ].filter(Boolean),
    ...source,
  };
}

function interestSuggestionItem(item) {
  const source = sourceEntryMeta(item.sourceEntryId);
  const clusters = clusterNames(item.clusters);
  return {
    id: idOf(item),
    kind: 'suggestedInterest',
    group: 'interests',
    title: item.title || 'Untitled interest suggestion',
    status: item.status || 'pending',
    sourceText: item.sourceText || '',
    createdAt: item.createdAt || '',
    meta: [
      item.category || 'Learning Curiosities',
      ...clusters,
      item.reason || '',
    ].filter(Boolean),
    ...source,
  };
}

function rippleItem(item) {
  return {
    id: idOf(item),
    kind: 'ripple',
    group: 'ripples',
    title: item.text || item.extractedText || 'Untitled ripple',
    status: item.status || 'pending',
    sourceDate: isoDate(item.dateKey),
    sourceEntryId: idOf(item.entryId),
    sourceText: item.originalContext || item.context || '',
    createdAt: item.createdAt || '',
    meta: [
      item.type || 'ripple',
      Number.isFinite(Number(item.score)) ? `Score ${item.score}` : '',
      item.section || '',
    ].filter(Boolean),
  };
}

function appointmentItem(item) {
  const source = sourceEntryMeta(item.entryId);
  const date = isoDate(item.date || item.startDate);
  const time = item.timeStart || item.time || '';
  return {
    id: idOf(item),
    kind: 'calendarAppointment',
    group: 'calendar',
    title: item.title || 'Untitled appointment',
    status: 'entry-automation',
    date,
    sourceDate: source.sourceDate || date,
    sourceEntryId: source.sourceEntryId,
    sourceTitle: source.sourceTitle,
    sourceText: item.details || '',
    createdAt: item.createdAt || '',
    meta: [
      'Appointment',
      date,
      time,
      item.location || '',
      item.rrule ? 'Repeats' : '',
    ].filter(Boolean),
  };
}

function eventItem(item) {
  const source = sourceEntryMeta(item.entryId);
  return {
    id: idOf(item),
    kind: 'calendarEvent',
    group: 'calendar',
    title: item.title || 'Untitled event',
    status: 'entry-automation',
    date: isoDate(item.date),
    sourceDate: source.sourceDate || isoDate(item.date),
    sourceEntryId: source.sourceEntryId,
    sourceTitle: source.sourceTitle,
    sourceText: item.description || '',
    pinned: !!item.pinned,
    createdAt: item.createdAt || '',
    meta: [
      'Important event',
      isoDate(item.date),
      item.cluster || '',
      item.pinned ? 'Pinned' : '',
    ].filter(Boolean),
  };
}

router.get('/', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const limit = clampLimit(req.query.limit);
    const [
      suggestedTasks,
      suggestedGatherItems,
      suggestedInterests,
      ripples,
      appointments,
      events,
    ] = await Promise.all([
      SuggestedTask.find({ userId, status: 'pending' })
        .populate('sourceRippleId', 'entryId dateKey text')
        .sort({ createdAt: -1 })
        .lean(),
      SuggestedGatherItem.find({ userId, status: 'pending' })
        .populate('clusters', 'name slug icon color')
        .populate('sourceEntryId', 'date title')
        .sort({ createdAt: -1 })
        .lean(),
      SuggestedInterest.find({ userId, status: 'pending' })
        .populate('clusters', 'name slug icon color')
        .populate('sourceEntryId', 'date title')
        .sort({ createdAt: -1 })
        .lean(),
      Ripple.find({ userId, status: 'pending' })
        .sort({ createdAt: -1 })
        .lean(),
      Appointment.find({ userId, source: 'entry-automation' })
        .populate('entryId', 'date title')
        .sort({ date: 1, startDate: 1, createdAt: -1 })
        .lean(),
      ImportantEvent.find({ userId, source: 'entry-automation' })
        .populate('entryId', 'date title')
        .sort({ date: 1, createdAt: -1 })
        .lean(),
    ]);

    const representedRippleIds = new Set(
      suggestedTasks
        .map((item) => idOf(item.sourceRippleId))
        .filter(Boolean)
    );
    const standaloneRipples = ripples.filter((item) => !representedRippleIds.has(idOf(item)));

    const items = [
      ...suggestedTasks.map(taskSuggestionItem),
      ...suggestedGatherItems.map(gatherSuggestionItem),
      ...suggestedInterests.map(interestSuggestionItem),
      ...standaloneRipples.map(rippleItem),
      ...appointments.map(appointmentItem),
      ...events.map(eventItem),
    ].sort(sortReviewItems).slice(0, limit);

    const counts = {
      tasks: suggestedTasks.length,
      gather: suggestedGatherItems.length,
      interests: suggestedInterests.length,
      ripples: standaloneRipples.length,
      calendar: appointments.length + events.length,
    };

    res.json({
      counts: {
        ...counts,
        total: Object.values(counts).reduce((sum, count) => sum + count, 0),
      },
      items,
    });
  } catch (err) {
    console.error('[review] inbox load failed:', err);
    res.status(500).json({ error: 'Failed to load review inbox' });
  }
});

export default router;
