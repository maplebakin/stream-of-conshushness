import mongoose from 'mongoose';

const { Schema } = mongoose;

const InterestSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true },
    normalizedTitle: { type: String, default: '', trim: true, index: true },
    description: { type: String, default: '', trim: true },
    category: { type: String, default: 'Learning Curiosities', trim: true, index: true },
    status: {
      type: String,
      enum: ['curious', 'exploring', 'active', 'paused', 'archived'],
      default: 'curious',
      index: true,
    },
    sourceEntryId: { type: Schema.Types.ObjectId, ref: 'Entry', default: null, index: true },
    sourceText: { type: String, default: '' },
    clusters: { type: [Schema.Types.ObjectId], ref: 'Cluster', default: [] },
    cluster: { type: String, default: '', trim: true },
    tags: { type: [String], default: [] },
    confidence: { type: Number, default: 0.7, min: 0, max: 1 },
    reason: { type: String, default: 'interestPhrase' },
  },
  { timestamps: true }
);

InterestSchema.index({ userId: 1, category: 1, normalizedTitle: 1, status: 1 });
InterestSchema.index({ userId: 1, status: 1, createdAt: -1 });
InterestSchema.index({ userId: 1, sourceEntryId: 1, status: 1 });
InterestSchema.index({ userId: 1, clusters: 1, status: 1 });

export default mongoose.model('Interest', InterestSchema);
