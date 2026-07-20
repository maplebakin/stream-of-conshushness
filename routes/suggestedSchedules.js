import express from 'express';
import mongoose from 'mongoose';
import Appointment from '../models/Appointment.js';
import Entry from '../models/Entry.js';
import SuggestedSchedule from '../models/SuggestedSchedule.js';
import { logSafeError } from '../utils/errorHandler.js';

const router = express.Router();
const { ObjectId } = mongoose.Types;

function userIdOf(req) {
  return req.user?.userId || req.user?._id || req.user?.id || null;
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validTime(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || ''));
}

function editedChange(original, input = {}) {
  const base = typeof original?.toObject === 'function' ? original.toObject() : { ...original };
  const selected = Object.prototype.hasOwnProperty.call(input, 'selected')
    ? !!input.selected
    : original.selected !== false;
  return {
    ...base,
    selected,
    targetAppointmentId: input.targetAppointmentId || original.targetAppointmentId || null,
    date: Object.prototype.hasOwnProperty.call(input, 'date') ? String(input.date || '') : original.date,
    start: Object.prototype.hasOwnProperty.call(input, 'start') ? String(input.start || '') : original.start,
    end: Object.prototype.hasOwnProperty.call(input, 'end') ? String(input.end || '') : original.end,
    title: Object.prototype.hasOwnProperty.call(input, 'title')
      ? String(input.title || '').trim()
      : String(original.title || 'Work').trim(),
    location: Object.prototype.hasOwnProperty.call(input, 'location')
      ? String(input.location || '').trim()
      : String(original.location || '').trim(),
  };
}

function validateChange(change) {
  if (!change.selected) return '';
  if (['add', 'change', 'move'].includes(change.action)) {
    if (!validDate(change.date)) return 'Every selected shift needs a valid date.';
    if (!validTime(change.start) || !validTime(change.end)) {
      return 'Every selected shift needs valid start and end times.';
    }
    if (change.end <= change.start) return 'A shift must end after it starts.';
    if (!change.title) return 'Every selected shift needs a title.';
  }
  if (['remove', 'change', 'move'].includes(change.action) && !change.targetAppointmentId) {
    return 'Choose the existing shift before accepting this change.';
  }
  return '';
}

function snapshot(appointment) {
  return {
    date: appointment?.date || '',
    start: appointment?.timeStart || '',
    end: appointment?.timeEnd || '',
  };
}

function historyRecord({ change, suggestion, from = {}, to = {} }) {
  return {
    action: change.action,
    sourceEntryId: suggestion.sourceEntryId,
    suggestionId: suggestion._id,
    from,
    to,
    at: new Date(),
  };
}

async function targetForChange({ change, suggestion, userId, applicationKey }) {
  if (!ObjectId.isValid(change.targetAppointmentId)) return null;
  const allowedIds = (change.candidateAppointmentIds || []).map(String);
  const originalTarget = String(
    suggestion.changes.find((candidate) => candidate.key === change.key)?.targetAppointmentId || ''
  );
  if (allowedIds.length && !allowedIds.includes(String(change.targetAppointmentId))) return null;
  if (!allowedIds.length && originalTarget && originalTarget !== String(change.targetAppointmentId)) return null;

  return Appointment.findOne({
    _id: change.targetAppointmentId,
    userId,
    scheduleLabel: suggestion.label,
    $or: [
      { scheduleStatus: { $ne: 'cancelled' } },
      { appliedScheduleChangeKeys: applicationKey },
    ],
  });
}

async function applyAddition({ change, suggestion, userId, applicationKey }) {
  const existing = await Appointment.findOne({
    userId,
    scheduleSuggestionId: suggestion._id,
    scheduleChangeKey: change.key,
  });
  if (existing) return existing;

  const payload = {
    userId,
    title: change.title || suggestion.label || 'Work',
    date: change.date,
    timeStart: change.start,
    timeEnd: change.end,
    location: change.location || '',
    details: '',
    entryId: suggestion.sourceEntryId,
    source: 'entry-automation',
    automationReviewStatus: 'kept',
    automationRevision: suggestion.automationRevision,
    scheduleGroupId: suggestion.scheduleGroupId,
    scheduleLabel: suggestion.label,
    scheduleStatus: 'active',
    scheduleSourceEntryIds: [suggestion.sourceEntryId],
    scheduleSuggestionId: suggestion._id,
    scheduleChangeKey: change.key,
    appliedScheduleChangeKeys: [applicationKey],
    scheduleHistory: [
      historyRecord({
        change,
        suggestion,
        to: { date: change.date, start: change.start, end: change.end },
      }),
    ],
  };
  try {
    return await Appointment.create(payload);
  } catch (error) {
    if (error?.code !== 11000) throw error;
    const retry = await Appointment.findOne({
      userId,
      scheduleSuggestionId: suggestion._id,
      scheduleChangeKey: change.key,
    });
    if (retry) return retry;
    throw error;
  }
}

async function applyDestructiveChange({ change, suggestion, userId, applicationKey }) {
  const target = await targetForChange({ change, suggestion, userId, applicationKey });
  if (!target) {
    const error = new Error('The existing shift is unavailable or does not belong to this schedule.');
    error.statusCode = 409;
    throw error;
  }
  if ((target.appliedScheduleChangeKeys || []).includes(applicationKey)) return target;

  const before = snapshot(target);
  if (change.action === 'remove') {
    target.scheduleStatus = 'cancelled';
  } else {
    target.date = change.date;
    target.timeStart = change.start;
    target.timeEnd = change.end;
    target.title = change.title || target.title || suggestion.label;
    target.location = change.location || '';
    target.scheduleStatus = 'active';
  }
  target.entryId = suggestion.sourceEntryId;
  target.source = 'entry-automation';
  target.automationReviewStatus = 'kept';
  target.scheduleGroupId = suggestion.scheduleGroupId;
  target.scheduleLabel = suggestion.label;
  target.scheduleSourceEntryIds = [
    ...new Set([
      ...(target.scheduleSourceEntryIds || []).map(String),
      String(suggestion.sourceEntryId),
    ]),
  ];
  target.appliedScheduleChangeKeys = [
    ...(target.appliedScheduleChangeKeys || []),
    applicationKey,
  ];
  target.scheduleHistory.push(historyRecord({
    change,
    suggestion,
    from: before,
    to: change.action === 'remove' ? {} : {
      date: change.date,
      start: change.start,
      end: change.end,
    },
  }));
  await target.save();
  return target;
}

router.put('/:id/accept', async (req, res) => {
  const userId = userIdOf(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: 'Invalid schedule suggestion id' });

  let suggestion;
  try {
    suggestion = await SuggestedSchedule.findOne({ _id: req.params.id, userId });
    if (!suggestion) return res.status(404).json({ error: 'Schedule suggestion not found' });
    if (suggestion.status === 'rejected') {
      return res.status(409).json({ error: 'This schedule suggestion was already rejected.' });
    }
    if (suggestion.status === 'accepted') {
      const appointments = await Appointment.find({
        userId,
        _id: { $in: suggestion.appliedAppointmentIds || [] },
      });
      return res.json({ suggestion, appointments, idempotent: true });
    }
    const source = await Entry.findOne({ _id: suggestion.sourceEntryId, userId }).select('_id');
    if (!source) return res.status(409).json({ error: 'The source entry is no longer available.' });

    const incoming = new Map(
      (Array.isArray(req.body?.changes) ? req.body.changes : [])
        .filter((change) => change?.key)
        .map((change) => [String(change.key), change])
    );
    const changes = suggestion.changes.map((change) => editedChange(change, incoming.get(change.key)));
    for (const change of changes) {
      const validationError = validateChange(change);
      if (validationError) return res.status(400).json({ error: validationError });
    }

    suggestion.status = 'accepting';
    await suggestion.save();
    const applied = [];
    for (const change of changes.filter((candidate) => candidate.selected)) {
      const applicationKey = `${suggestion._id}:${change.key}`;
      const appointment = change.action === 'add'
        ? await applyAddition({ change, suggestion, userId, applicationKey })
        : await applyDestructiveChange({ change, suggestion, userId, applicationKey });
      if (appointment) applied.push(appointment);
    }

    suggestion.changes = changes;
    suggestion.acceptedChangeKeys = changes.filter((change) => change.selected).map((change) => change.key);
    suggestion.appliedAppointmentIds = [...new Set(applied.map((appointment) => String(appointment._id)))];
    suggestion.status = 'accepted';
    await suggestion.save();
    return res.json({
      suggestion,
      appointments: applied,
      calendarPath: `/calendar?from=${suggestion.periodStart}&to=${suggestion.periodEnd}`,
    });
  } catch (error) {
    if (suggestion && suggestion.status === 'accepting') {
      suggestion.status = 'pending';
      await suggestion.save().catch(() => {});
    }
    logSafeError('schedule suggestion accept failed', error);
    if (error?.code === 11000) {
      return res.status(409).json({
        error: 'One of these shifts conflicts with an existing appointment. Edit or deselect it and try again.',
      });
    }
    return res.status(error?.statusCode || 500).json({
      error: error?.statusCode ? error.message : 'Failed to apply schedule changes',
    });
  }
});

router.put('/:id/reject', async (req, res) => {
  try {
    const userId = userIdOf(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: 'Invalid schedule suggestion id' });
    const suggestion = await SuggestedSchedule.findOne({ _id: req.params.id, userId });
    if (!suggestion) return res.status(404).json({ error: 'Schedule suggestion not found' });
    if (suggestion.status === 'accepted') {
      return res.status(409).json({ error: 'An accepted schedule cannot be rejected.' });
    }
    suggestion.status = 'rejected';
    await suggestion.save();
    return res.json({ suggestion });
  } catch (error) {
    logSafeError('schedule suggestion reject failed', error);
    return res.status(500).json({ error: 'Failed to reject schedule suggestion' });
  }
});

export default router;
