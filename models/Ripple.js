// models/Ripple.js
import mongoose from 'mongoose';

const RippleSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true, required: true },
    entryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Entry' },
    automationRevision: { type: Number, default: 0, min: 0 },
    // Stable receipt for direct /ripples/analyze requests. Legacy and
    // entry-automation ripples omit it, so the index remains compatible with
    // existing data while making direct analysis retries concurrency-safe.
    analysisKey: { type: String, trim: true, maxlength: 64, default: undefined },
    dateKey: { type: String, index: true }, // 'YYYY-MM-DD' for easy daily querying
    text: { type: String, required: true },
    section: { type: String, default: '' },
    score: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['pending', 'approved', 'dismissed', 'applied'],
      default: 'pending',
      index: true,
    },
    source: { type: String, default: 'analyze' }, // free text: 'analyze', 'manual', etc.
    type: { type: String, default: '' },           // e.g. 'suggestedTask', 'appointment', etc.
    meta: { type: mongoose.Schema.Types.Mixed, default: {} }, // stores dueDate, recurrence, etc.
  },
  { timestamps: true }
);

// quick daily indexing
RippleSchema.index({ userId: 1, dateKey: 1, status: 1, createdAt: -1 });
RippleSchema.index({ userId: 1, entryId: 1, status: 1, automationRevision: 1 });
RippleSchema.index(
  { userId: 1, analysisKey: 1 },
  {
    unique: true,
    partialFilterExpression: { analysisKey: { $type: 'string' } },
  }
);

export default mongoose.model('Ripple', RippleSchema);
