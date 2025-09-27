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
    entryId  : { type: Schema.Types.ObjectId, ref: 'Entry', default: null },
  },
  { timestamps: true }
);

// ---------- Normalizers ----------
function normHHMM(v) {
  if (!v) return v;
  const [h = '', m = ''] = String(v).split(':');
  const hh = String(h).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  const out = `${hh}:${mm}`;
  return /^\d{2}:\d{2}$/.test(out) ? out : null;
}

AppointmentSchema.pre('validate', function(next) {
  // Legacy mirroring
  if (!this.timeStart && this.time) this.timeStart = this.time;

  this.timeStart = normHHMM(this.timeStart);
  this.timeEnd   = normHHMM(this.timeEnd);
  this.time      = normHHMM(this.time);

  // If this is a series, ensure startDate exists
  if (this.rrule && !this.startDate) {
    this.invalidate('startDate', 'startDate is required when rrule is provided');
  }
  next();
});

// Instances only (helpful uniqueness guard when users manually add duplicates)
AppointmentSchema.index(
  { userId: 1, date: 1, timeStart: 1, title: 1 },
  { unique: true, sparse: true }
);

export default mongoose.model('Appointment', AppointmentSchema);
