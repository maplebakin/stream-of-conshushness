import Appointment from '../models/Appointment.js';
import { expandDatesInRange, isValidISODate } from './recurrence.js';

export function isISODateString(value) {
  return isValidISODate(value);
}

function isoToUTCNoon(iso) {
  if (!isISODateString(iso)) return null;
  const [year, month, day] = iso.split('-').map((part) => parseInt(part, 10));
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

export function addDays(iso, amount) {
  const date = isoToUTCNoon(iso);
  if (!date) return '';
  date.setUTCDate(date.getUTCDate() + amount);
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

export function daysBetween(fromISO, toISO) {
  const from = isoToUTCNoon(fromISO);
  const to = isoToUTCNoon(toISO);
  if (!from || !to) return null;
  return Math.round((to.getTime() - from.getTime()) / 86400000);
}

export function countdownLabel(daysUntil) {
  if (!Number.isFinite(daysUntil) || daysUntil < 0) return null;
  if (daysUntil === 0) return 'Today';
  if (daysUntil === 1) return 'Tomorrow';
  return `${daysUntil} days until`;
}

export function displayLabelFor(title, daysUntil) {
  const label = countdownLabel(daysUntil);
  if (!label) return '';
  if (daysUntil === 0 || daysUntil === 1) return `${label}: ${title}`;
  return `${label} ${title}`;
}

export function recurringInstance(series, date, userId) {
  return {
    _id: `virtual:${series._id}:${date}`,
    userId,
    title: series.title,
    date,
    rrule: series.rrule,
    startDate: series.startDate,
    until: series.until,
    tz: series.tz || 'America/Toronto',
    time: series.time || null,
    timeStart: series.timeStart || null,
    timeEnd: series.timeEnd || null,
    location: series.location || '',
    details: series.details || '',
    cluster: series.cluster || '',
    clusters: Array.isArray(series.clusters) ? series.clusters : [],
    entryId: series.entryId || null,
    source: series.source || '',
    isRecurring: true,
    seriesId: series._id,
  };
}

export async function appointmentInstancesInRange(userId, from, to) {
  if (!isISODateString(from) || !isISODateString(to) || from > to) return [];

  const oneOffs = await Appointment.find({
    userId,
    automationReviewStatus: { $nin: ['pending', 'dismissed'] },
    scheduleStatus: { $ne: 'cancelled' },
    date: { $gte: from, $lte: to },
    rrule: '',
  });

  const series = await Appointment.find({
    userId,
    automationReviewStatus: { $nin: ['pending', 'dismissed'] },
    scheduleStatus: { $ne: 'cancelled' },
    rrule: { $ne: '' },
    startDate: { $lte: to },
    $or: [{ until: null }, { until: { $gte: from } }, { until: '' }],
  });

  const virtuals = [];
  for (const item of series || []) {
    const expandTo = item.until && item.until < to ? item.until : to;
    const dates = expandDatesInRange(item.rrule, item.startDate, from, expandTo);
    for (const date of dates) {
      virtuals.push(recurringInstance(item, date, userId));
    }
  }

  const seen = new Set((oneOffs || []).map((a) => `${a.date}|${a.timeStart || ''}|${a.title}`));
  const dedupedVirtuals = virtuals.filter((v) => !seen.has(`${v.date}|${v.timeStart || ''}|${v.title}`));

  return [...(oneOffs || []), ...dedupedVirtuals].sort((a, b) => {
    const ka = `${a.date || ''}T${a.timeStart || a.time || '99:99'}`;
    const kb = `${b.date || ''}T${b.timeStart || b.time || '99:99'}`;
    return ka.localeCompare(kb);
  });
}
