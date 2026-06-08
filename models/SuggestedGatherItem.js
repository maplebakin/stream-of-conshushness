import mongoose from 'mongoose';

const { Schema } = mongoose;

const SuggestedGatherItemSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    clusters: { type: [Schema.Types.ObjectId], ref: 'Cluster', default: [] },
    list: { type: String, default: 'Things to Buy', trim: true, index: true },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'rejected'],
      default: 'pending',
      index: true,
    },
    sourceEntryId: { type: Schema.Types.ObjectId, ref: 'Entry', required: true, index: true },
    sourceText: { type: String, default: '' },
    confidence: { type: Number, default: 0.7, min: 0, max: 1 },
    reason: { type: String, default: 'needPhrase' },
    tags: { type: [String], default: [] },
  },
  { timestamps: true }
);

SuggestedGatherItemSchema.index({ userId: 1, sourceEntryId: 1, status: 1 });
SuggestedGatherItemSchema.index({ userId: 1, status: 1, createdAt: -1 });

export default mongoose.model('SuggestedGatherItem', SuggestedGatherItemSchema);
