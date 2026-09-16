import { describeRepeat } from './repeat.js';
import { humanizeRRULE } from './rruleHumanize.js';

export function taskRecurrenceLabel(task) {
  const rrule = typeof task?.rrule === 'string' ? task.rrule.trim() : '';
  if (rrule) return humanizeRRULE(rrule);

  // Preserve visibility for older task records while making `rrule` the
  // authoritative recurrence field for current records.
  return describeRepeat(task?.repeat);
}
