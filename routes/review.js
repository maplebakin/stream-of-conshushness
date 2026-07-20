import express from 'express';
import Appointment from '../models/Appointment.js';
import ImportantEvent from '../models/ImportantEvent.js';
import Ripple from '../models/Ripple.js';
import SuggestedGatherItem from '../models/SuggestedGatherItem.js';
import SuggestedInterest from '../models/SuggestedInterest.js';
import SuggestedTask from '../models/SuggestedTask.js';
import SuggestedSchedule from '../models/SuggestedSchedule.js';
import { logSafeError } from '../utils/errorHandler.js';
import { resolveSourceEntries, sourceEntryMeta, sourceIdsFrom } from '../utils/sourceEntryState.js';

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

async function countDocuments(Model, query, fallback) {
  if (typeof Model.countDocuments !== 'function') return fallback;
  return Model.countDocuments(query);
}

function taskSuggestionItem(item, sourceMap) {
  const source = sourceRippleMeta(item.sourceRippleId);
  const sourceEntry = sourceEntryMeta(sourceMap, source.sourceEntryId);
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
    ...sourceEntry,
    sourceText: sourceEntry.sourceState && !sourceEntry.sourceAvailable ? '' : source.sourceText,
  };
}

function gatherSuggestionItem(item, sourceMap) {
  const source = sourceEntryMeta(sourceMap, item.sourceEntryId, { includeExcerpt: true });
  const clusters = clusterNames(item.clusters);
  return {
    id: idOf(item),
    kind: 'suggestedGatherItem',
    group: 'gather',
    title: item.title || 'Untitled gather suggestion',
    status: item.status || 'pending',
    list: item.list || 'Things to Buy',
    sourceText: source.sourceState && !source.sourceAvailable ? '' : item.sourceText || '',
    createdAt: item.createdAt || '',
    meta: [
      item.list || 'Things to Buy',
      ...clusters,
      item.reason || '',
    ].filter(Boolean),
    ...source,
  };
}

function interestSuggestionItem(item, sourceMap) {
  const source = sourceEntryMeta(sourceMap, item.sourceEntryId, { includeExcerpt: true });
  const clusters = clusterNames(item.clusters);
  return {
    id: idOf(item),
    kind: 'suggestedInterest',
    group: 'interests',
    title: item.title || 'Untitled interest suggestion',
    status: item.status || 'pending',
    category: item.category || 'Learning Curiosities',
    sourceText: source.sourceState && !source.sourceAvailable ? '' : item.sourceText || '',
    createdAt: item.createdAt || '',
    meta: [
      item.category || 'Learning Curiosities',
      ...clusters,
      item.reason || '',
    ].filter(Boolean),
    ...source,
  };
}

function rippleItem(item, sourceMap) {
  const source = sourceEntryMeta(sourceMap, item.entryId);
  return {
    id: idOf(item),
    kind: 'ripple',
    group: 'ripples',
    title: item.text || item.extractedText || 'Untitled ripple',
    status: item.status || 'pending',
    sourceDate: source.sourceState ? source.sourceDate : isoDate(item.dateKey),
    sourceEntryId: source.sourceEntryId || idOf(item.entryId),
    sourceText: source.sourceState && !source.sourceAvailable ? '' : item.originalContext || item.context || '',
    createdAt: item.createdAt || '',
    meta: [
      item.type || 'ripple',
      Number.isFinite(Number(item.score)) ? `Score ${item.score}` : '',
      item.section || '',
    ].filter(Boolean),
    ...source,
  };
}

function appointmentItem(item, sourceMap) {
  const source = sourceEntryMeta(sourceMap, item.entryId, { includeExcerpt: true });
  const date = isoDate(item.date || item.startDate);
  const time = item.timeStart || item.time || '';
  return {
    id: idOf(item),
    kind: 'calendarAppointment',
    group: 'calendar',
    title: item.title || 'Untitled appointment',
    status: 'entry-automation',
    date,
    sourceDate: source.sourceState ? source.sourceDate : source.sourceDate || date,
    sourceEntryId: source.sourceEntryId,
    sourceTitle: source.sourceTitle,
    sourceEntryExcerpt: source.sourceEntryExcerpt,
    sourceText: item.details || '',
    createdAt: item.createdAt || '',
    meta: [
      'Appointment',
      date,
      time,
      item.location || '',
      item.rrule ? 'Repeats' : '',
    ].filter(Boolean),
    ...source,
  };
}

function eventItem(item, sourceMap) {
  const source = sourceEntryMeta(sourceMap, item.entryId, { includeExcerpt: true });
  return {
    id: idOf(item),
    kind: 'calendarEvent',
    group: 'calendar',
    title: item.title || 'Untitled event',
    status: 'entry-automation',
    date: isoDate(item.date),
    sourceDate: source.sourceState ? source.sourceDate : source.sourceDate || isoDate(item.date),
    sourceEntryId: source.sourceEntryId,
    sourceTitle: source.sourceTitle,
    sourceEntryExcerpt: source.sourceEntryExcerpt,
    sourceText: item.description || '',
    pinned: !!item.pinned,
    createdAt: item.createdAt || '',
    meta: [
      'Important event',
      isoDate(item.date),
      item.cluster || '',
      item.pinned ? 'Pinned' : '',
    ].filter(Boolean),
    ...source,
  };
}

function scheduleSuggestionItem(item, sourceMap) {
  const source = sourceEntryMeta(sourceMap, item.sourceEntryId, { includeExcerpt: true });
  const changes = (item.changes || []).map((change) => ({
    ...change,
    targetAppointmentId: idOf(change.targetAppointmentId),
    candidateAppointmentIds: (change.candidateAppointmentIds || []).map(idOf),
    candidateAppointments: (change.candidateAppointments || []).map((candidate) => ({
      ...candidate,
      id: idOf(candidate.id),
    })),
  }));
  const counts = changes.reduce((result, change) => {
    result[change.action] = (result[change.action] || 0) + 1;
    return result;
  }, {});
  return {
    id: idOf(item),
    kind: 'scheduleSuggestion',
    group: 'calendar',
    title: `${item.label || 'Work'} schedule`,
    status: item.status || 'pending',
    label: item.label || 'Work',
    mode: item.mode || 'capture',
    date: item.periodStart,
    periodStart: item.periodStart,
    periodEnd: item.periodEnd,
    scheduleGroupId: item.scheduleGroupId || '',
    changes,
    sourceText: source.sourceState && !source.sourceAvailable ? '' : item.sourceText || '',
    createdAt: item.createdAt || '',
    meta: [
      `${changes.length} proposed ${changes.length === 1 ? 'change' : 'changes'}`,
      counts.add ? `${counts.add} add` : '',
      counts.remove ? `${counts.remove} remove` : '',
      counts.change ? `${counts.change} time ${counts.change === 1 ? 'change' : 'changes'}` : '',
      counts.move ? `${counts.move} move` : '',
    ].filter(Boolean),
    ...source,
  };
}

router.get('/', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const limit = clampLimit(req.query.limit);
    // In-flight accept/reject states remain review-visible so a browser or
    // server interruption can be retried instead of stranding the inference.
    const pendingStatus = { $in: ['pending', 'accepting', 'rejecting'] };
    const pendingAcceptanceStatus = { $in: ['pending', 'accepting'] };
    const pendingTaskQuery = { userId, status: pendingStatus };
    const allRepresentedRippleIds = typeof SuggestedTask.distinct === 'function'
      ? (await SuggestedTask.distinct('sourceRippleId', pendingTaskQuery)).filter(Boolean)
      : [];
    const pendingRippleQuery = {
      userId,
      status: 'pending',
      ...(allRepresentedRippleIds.length ? { _id: { $nin: allRepresentedRippleIds } } : {}),
    };
    const [
      suggestedTasks,
      suggestedGatherItems,
      suggestedInterests,
      suggestedSchedules,
      ripples,
      appointments,
      events,
    ] = await Promise.all([
      SuggestedTask.find(pendingTaskQuery)
        .populate({
          path: 'sourceRippleId',
          select: 'entryId dateKey text',
          match: { userId },
        })
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean(),
      SuggestedGatherItem.find({ userId, status: pendingAcceptanceStatus })
        .populate({ path: 'clusters', select: 'name slug icon color', match: { ownerId: userId } })
        .populate({ path: 'sourceEntryId', select: '_id', match: { userId } })
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean(),
      SuggestedInterest.find({ userId, status: pendingAcceptanceStatus })
        .populate({ path: 'clusters', select: 'name slug icon color', match: { ownerId: userId } })
        .populate({ path: 'sourceEntryId', select: '_id', match: { userId } })
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean(),
      SuggestedSchedule.find({ userId, status: pendingAcceptanceStatus })
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean(),
      Ripple.find(pendingRippleQuery)
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean(),
      Appointment.find({
        userId,
        source: 'entry-automation',
        automationReviewStatus: { $nin: ['kept', 'dismissed'] },
      })
        .populate({ path: 'entryId', select: '_id', match: { userId } })
        .sort({ date: 1, startDate: 1, createdAt: -1 })
        .limit(limit)
        .lean(),
      ImportantEvent.find({
        userId,
        source: 'entry-automation',
        automationReviewStatus: { $nin: ['kept', 'dismissed'] },
      })
        .populate({ path: 'entryId', select: '_id', match: { userId } })
        .sort({ date: 1, createdAt: -1 })
        .limit(limit)
        .lean(),
    ]);

    const representedRippleIds = new Set(
      suggestedTasks
        .map((item) => idOf(item.sourceRippleId))
        .filter(Boolean)
    );
    const standaloneRipples = ripples.filter((item) => !representedRippleIds.has(idOf(item)));
    const sourceMap = await resolveSourceEntries({
      userId,
      sourceIds: [
        ...sourceIdsFrom(suggestedTasks, (item) => item?.sourceRippleId?.entryId),
        ...sourceIdsFrom(suggestedGatherItems, (item) => item?.sourceEntryId),
        ...sourceIdsFrom(suggestedInterests, (item) => item?.sourceEntryId),
        ...sourceIdsFrom(suggestedSchedules, (item) => item?.sourceEntryId),
        ...sourceIdsFrom(standaloneRipples, (item) => item?.entryId),
        ...sourceIdsFrom(appointments, (item) => item?.entryId),
        ...sourceIdsFrom(events, (item) => item?.entryId),
      ],
    });

    const items = [
      ...suggestedTasks.map((item) => taskSuggestionItem(item, sourceMap)),
      ...suggestedGatherItems.map((item) => gatherSuggestionItem(item, sourceMap)),
      ...suggestedInterests.map((item) => interestSuggestionItem(item, sourceMap)),
      ...suggestedSchedules.map((item) => scheduleSuggestionItem(item, sourceMap)),
      ...standaloneRipples.map((item) => rippleItem(item, sourceMap)),
      ...appointments.map((item) => appointmentItem(item, sourceMap)),
      ...events.map((item) => eventItem(item, sourceMap)),
    ].sort(sortReviewItems).slice(0, limit);

    const [taskCount, gatherCount, interestCount, scheduleCount, rippleCount, appointmentCount, eventCount] = await Promise.all([
      countDocuments(SuggestedTask, pendingTaskQuery, suggestedTasks.length),
      countDocuments(SuggestedGatherItem, { userId, status: pendingAcceptanceStatus }, suggestedGatherItems.length),
      countDocuments(SuggestedInterest, { userId, status: pendingAcceptanceStatus }, suggestedInterests.length),
      countDocuments(SuggestedSchedule, { userId, status: pendingAcceptanceStatus }, suggestedSchedules.length),
      countDocuments(Ripple, pendingRippleQuery, standaloneRipples.length),
      countDocuments(Appointment, {
        userId,
        source: 'entry-automation',
        automationReviewStatus: { $nin: ['kept', 'dismissed'] },
      }, appointments.length),
      countDocuments(ImportantEvent, {
        userId,
        source: 'entry-automation',
        automationReviewStatus: { $nin: ['kept', 'dismissed'] },
      }, events.length),
    ]);
    const counts = {
      tasks: taskCount,
      gather: gatherCount,
      interests: interestCount,
      ripples: rippleCount,
      calendar: appointmentCount + eventCount + scheduleCount,
    };

    res.json({
      counts: {
        ...counts,
        total: Object.values(counts).reduce((sum, count) => sum + count, 0),
      },
      items,
    });
  } catch (err) {
    logSafeError('review inbox load failed', err);
    res.status(500).json({ error: 'Failed to load review inbox' });
  }
});

export default router;
