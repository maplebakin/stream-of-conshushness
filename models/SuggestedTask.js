// models/SuggestedTask.js
import mongoose from 'mongoose';

const suggestedTaskSchema = new mongoose.Schema(
  {
    /* ownership / linkage */
    userId       : { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    sourceRippleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ripple', required: true },
    sourceEntryId : { type: mongoose.Schema.Types.ObjectId, ref: 'Entry', default: null, index: true },
    automationRevision: { type: Number, default: 0, min: 0 },

    /* draft data */
    title     : { type: String, required: true },
    priority  : { type: String, enum: ['high','medium','low'], default: 'low' },
    dueDate   : { type: Date },          // populated by chrono parser if present
    repeat    : { type: String },        // 'weekly', 'monthly', etc.
    cluster   : { type: String },
    section   : { type: String },

    /* review state */
    status    : {
      type: String,
      enum: ['pending','accepting','rejecting','accepted','rejected','superseded'],
      default: 'pending'
    },
    // Persist the first accepted edit before creating the destination. This
    // makes concurrent/retried acceptance use one canonical payload while the
    // final artifact is protected from source-entry cleanup.
    acceptancePayload: { type: mongoose.Schema.Types.Mixed, default: null },
    acceptanceStartedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

suggestedTaskSchema.index({ userId: 1, sourceEntryId: 1, status: 1, automationRevision: 1 });

export default mongoose.model('SuggestedTask', suggestedTaskSchema);
