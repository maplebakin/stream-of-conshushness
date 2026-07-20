// server/models/Appointment.js
import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * Appointment supports either:
 *  A) One-off instance   → { title, date, timeStart?, timeEnd?, ... }
 *  B) Recurring series   → { title, startDate, rrule, timeStart?, timeEnd?, ... }
 *
 * Notes:
 * - If `rrule` is present, `date` is optional and ignored during expansion.
 * - `startDate` acts as DTSTART for the recurrence window (inclusive).
 * - `cluster` is supported (bugfix: was referenced by callers but not on schema).
 * - `tz` defaults to 'America/Toronto' for all expansions.
 */

const AppointmentSchema = new Schema(
  {
    userId   : { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title    : { type: String, required: true },

    // One-off date (YYYY-MM-DD). Required iff not recurring.
    date     : {
      type: String,
      default: null,
      validate: {
        validator() {
          // require date if not a series
          return !!(this.rrule || this.date);
        },
        message: 'date is required when rrule is not provided'
      }
    },

    // Recurrence
    rrule    : { type: String, default: '' },        // e.g., "FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,WE,FR"
    startDate: { type: String, default: null },      // DTSTART (YYYY-MM-DD) for series
    until    : { type: String, default: null },      // optional UNTIL (YYYY-MM-DD)
    tz       : { type: String, default: 'America/Toronto' },

    // Time (HH:MM). You can use legacy 'time' too; we normalize it.
    time     : { type: String, default: null },      // legacy single time
    timeStart: { type: String, default: null },
    timeEnd  : { type: String, default: null },

    location : { type: String, default: '' },
    details  : { type: String, default: '' },

    // Optional linkage / scoping
    cluster  : { type: String, default: '' },
    clusters : { type: [Schema.Types.ObjectId], ref: 'Cluster', default: [] },
    entryId  : { type: Schema.Types.ObjectId, ref: 'Entry', default: null },
    source   : { type: String, default: '' },
    automationRevision: { type: Number, default: 0, min: 0 },
    automationReviewStatus: {
      type: String,
      enum: ['pending', 'kept', 'dismissed'],
      default: null,
      index: true,
    },
    scheduleGroupId: { type: String, default: '', trim: true, index: true },
    scheduleLabel: { type: String, default: '', trim: true },
    scheduleStatus: {
      type: String,
      enum: ['active', 'cancelled'],
      default: 'active',
      index: true,
    },
    scheduleSourceEntryIds: {
      type: [Schema.Types.ObjectId],
      ref: 'Entry',
      default: [],
    },
    scheduleSuggestionId: {
      type: Schema.Types.ObjectId,
      ref: 'SuggestedSchedule',
      default: null,
    },
    scheduleChangeKey: { type: String, default: '' },
    appliedScheduleChangeKeys: { type: [String], default: [] },
    scheduleHistory: {
      type: [{
        action: { type: String, enum: ['add', 'remove', 'change', 'move'], required: true },
        sourceEntryId: { type: Schema.Types.ObjectId, ref: 'Entry', default: null },
        suggestionId: { type: Schema.Types.ObjectId, ref: 'SuggestedSchedule', default: null },
        from: {
          date: { type: String, default: '' },
          start: { type: String, default: '' },
          end: { type: String, default: '' },
        },
        to: {
          date: { type: String, default: '' },
          start: { type: String, default: '' },
          end: { type: String, default: '' },
        },
        at: { type: Date, default: Date.now },
      }],
      default: [],
    },
  },
  { timestamps: true }
);

// ---------- Normalizers ----------
function normHHMM(v) {
  if (!v) return v;
  const match = String(v).trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function validISODate(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

AppointmentSchema.pre('validate', function(next) {
  // Legacy mirroring
  if (!this.timeStart && this.time) this.timeStart = this.time;

  for (const field of ['timeStart', 'timeEnd', 'time']) {
    const raw = this[field];
    const normalized = normHHMM(raw);
    if (raw && !normalized) this.invalidate(field, `${field} must be a valid HH:MM time`);
    this[field] = normalized;
  }

  if (this.timeStart && this.timeEnd && this.timeEnd < this.timeStart) {
    this.invalidate('timeEnd', 'timeEnd must not be earlier than timeStart');
  }
  for (const field of ['date', 'startDate', 'until']) {
    if (this[field] && !validISODate(this[field])) this.invalidate(field, `${field} must be YYYY-MM-DD`);
  }
  if (this.rrule && this.until && this.startDate && this.until < this.startDate) {
    this.invalidate('until', 'until must not be earlier than startDate');
  }

  // If this is a series, ensure startDate exists
  if (this.rrule && !this.startDate) {
    this.invalidate('startDate', 'startDate is required when rrule is provided');
  }
  next();
});

// Instances only (helpful uniqueness guard when users manually add duplicates)
AppointmentSchema.index(
  { userId: 1, date: 1, timeStart: 1, title: 1 },
  {
    name: 'appointment_one_off_unique_v2',
    unique: true,
    partialFilterExpression: { date: { $type: 'string' } },
  }
);

AppointmentSchema.index({ userId: 1, clusters: 1, date: 1 });
AppointmentSchema.index({ userId: 1, source: 1, date: 1 });
AppointmentSchema.index({ userId: 1, source: 1, automationReviewStatus: 1, date: 1 });
AppointmentSchema.index({ userId: 1, entryId: 1, source: 1, automationReviewStatus: 1, automationRevision: 1 });
AppointmentSchema.index({ userId: 1, scheduleLabel: 1, scheduleStatus: 1, date: 1 });
AppointmentSchema.index(
  { userId: 1, scheduleSuggestionId: 1, scheduleChangeKey: 1 },
  {
    unique: true,
    partialFilterExpression: { scheduleSuggestionId: { $type: 'objectId' } },
    name: 'appointment_schedule_change_unique',
  }
);

export default mongoose.model('Appointment', AppointmentSchema);
