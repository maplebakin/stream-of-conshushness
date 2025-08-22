// server/models/Appointment.js
import mongoose from 'mongoose';

const AppointmentSchema = new mongoose.Schema(
  {
    userId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title:    { type: String, required: true },
    date:     { type: String, required: true }, // 'YYYY-MM-DD'

    // Either old 'time' (HH:MM) or the newer 'timeStart'/'timeEnd'
    time:      { type: String, default: null }, // legacy
    timeStart: { type: String, default: null },
    timeEnd:   { type: String, default: null },

    location: { type: String, default: '' },
    details:  { type: String, default: '' },    // was required before — now optional
  },
  { timestamps: true }
);

/**
 * Normalize incoming time fields:
 * - if only `time` provided, mirror to `timeStart`
 * - coerce 9:5 -> 09:05
 */
function normalizeHHMM(v) {
  if (!v) return v;
  const [h = '', m = ''] = String(v).split(':');
  const hh = String(h).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  return /^\d{2}:\d{2}$/.test(`${hh}:${mm}`) ? `${hh}:${mm}` : null;
}

AppointmentSchema.pre('validate', function(next) {
  if (!this.timeStart && this.time) this.timeStart = this.time;

  this.timeStart = normalizeHHMM(this.timeStart);
  this.timeEnd   = normalizeHHMM(this.timeEnd);
  this.time      = normalizeHHMM(this.time);
// Avoid dupes for the same (user, date, timeStart, title)
AppointmentSchema.index(
  { userId: 1, date: 1, timeStart: 1, title: 1 },
  { unique: true, sparse: true } // only applies when timeStart is present
);

  // if both normalized to null, leave them null — all-day is allowed
  next();
});

export default mongoose.model('Appointment', AppointmentSchema);
