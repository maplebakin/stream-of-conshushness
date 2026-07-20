import mongoose from 'mongoose';

const { Schema } = mongoose;

const ScheduleSnapshotSchema = new Schema({
  date: { type: String, default: '' },
  start: { type: String, default: '' },
  end: { type: String, default: '' },
}, { _id: false });

const CandidateAppointmentSchema = new Schema({
  id: { type: Schema.Types.ObjectId, ref: 'Appointment', required: true },
  date: { type: String, default: '' },
  start: { type: String, default: '' },
  end: { type: String, default: '' },
}, { _id: false });

const ScheduleChangeSchema = new Schema({
  key: { type: String, required: true },
  action: {
    type: String,
    enum: ['add', 'remove', 'change', 'move'],
    required: true,
  },
  selected: { type: Boolean, default: true },
  targetAppointmentId: { type: Schema.Types.ObjectId, ref: 'Appointment', default: null },
  candidateAppointmentIds: { type: [Schema.Types.ObjectId], ref: 'Appointment', default: [] },
  candidateAppointments: { type: [CandidateAppointmentSchema], default: [] },
  previous: { type: ScheduleSnapshotSchema, default: () => ({}) },
  date: { type: String, default: '' },
  start: { type: String, default: '' },
  end: { type: String, default: '' },
  title: { type: String, default: 'Work', trim: true },
  location: { type: String, default: '', trim: true },
  confidence: { type: Number, default: 0.75, min: 0, max: 1 },
  ambiguous: { type: Boolean, default: false },
  warnings: { type: [String], default: [] },
}, { _id: false });

const SuggestedScheduleSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  sourceEntryId: { type: Schema.Types.ObjectId, ref: 'Entry', required: true, index: true },
  automationRevision: { type: Number, required: true, min: 0 },
  scheduleGroupId: { type: String, required: true, trim: true, index: true },
  label: { type: String, default: 'Work', trim: true },
  mode: { type: String, enum: ['capture', 'update', 'replace'], default: 'capture' },
  periodStart: { type: String, required: true },
  periodEnd: { type: String, required: true },
  sourceText: { type: String, default: '' },
  changes: { type: [ScheduleChangeSchema], default: [] },
  status: {
    type: String,
    enum: ['pending', 'accepting', 'accepted', 'rejecting', 'rejected'],
    default: 'pending',
    index: true,
  },
  acceptedChangeKeys: { type: [String], default: [] },
  appliedAppointmentIds: { type: [Schema.Types.ObjectId], ref: 'Appointment', default: [] },
}, { timestamps: true });

SuggestedScheduleSchema.index(
  { userId: 1, sourceEntryId: 1, automationRevision: 1 },
  { unique: true, name: 'suggested_schedule_source_revision_unique' }
);
SuggestedScheduleSchema.index({ userId: 1, status: 1, createdAt: -1 });
SuggestedScheduleSchema.index({ userId: 1, scheduleGroupId: 1, status: 1 });

export default mongoose.models.SuggestedSchedule
  || mongoose.model('SuggestedSchedule', SuggestedScheduleSchema);
