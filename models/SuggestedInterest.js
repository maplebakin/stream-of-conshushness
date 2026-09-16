import mongoose from 'mongoose';

const { Schema } = mongoose;

const SuggestedInterestSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true },
    normalizedTitle: { type: String, default: '', trim: true, index: true },
    description: { type: String, default: '', trim: true },
    category: { type: String, default: 'Learning Curiosities', trim: true, index: true },
    status: {
      type: String,
      enum: ['pending', 'accepting', 'accepted', 'rejected'],
      default: 'pending',
      index: true,
    },
    sourceEntryId: { type: Schema.Types.ObjectId, ref: 'Entry', required: true, index: true },
    automationRevision: { type: Number, default: 0, min: 0 },
    sourceText: { type: String, default: '' },
    clusters: { type: [Schema.Types.ObjectId], ref: 'Cluster', default: [] },
    cluster: { type: String, default: '', trim: true },
    tags: { type: [String], default: [] },
    confidence: { type: Number, default: 0.7, min: 0, max: 1 },
    reason: { type: String, default: 'interestPhrase' },
    acceptancePayload: { type: Schema.Types.Mixed, default: null },
    acceptanceStartedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

SuggestedInterestSchema.index({ userId: 1, category: 1, normalizedTitle: 1, status: 1 });
SuggestedInterestSchema.index({ userId: 1, status: 1, createdAt: -1 });
SuggestedInterestSchema.index({ userId: 1, sourceEntryId: 1, status: 1 });
SuggestedInterestSchema.index({ userId: 1, sourceEntryId: 1, status: 1, automationRevision: 1 });
SuggestedInterestSchema.index({ userId: 1, clusters: 1, status: 1 });

export default mongoose.model('SuggestedInterest', SuggestedInterestSchema);
