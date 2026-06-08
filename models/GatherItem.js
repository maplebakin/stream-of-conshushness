import mongoose from 'mongoose';

const { Schema } = mongoose;

const GatherItemSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true },
    normalizedTitle: { type: String, default: '', trim: true, index: true },
    description: { type: String, default: '', trim: true },
    clusters: { type: [Schema.Types.ObjectId], ref: 'Cluster', default: [] },
    list: { type: String, default: 'Things to Buy', trim: true, index: true },
    status: {
      type: String,
      enum: ['needed', 'found', 'bought', 'dismissed'],
      default: 'needed',
      index: true,
    },
    sourceEntryId: { type: Schema.Types.ObjectId, ref: 'Entry', default: null, index: true },
    sourceText: { type: String, default: '' },
    tags: { type: [String], default: [] },
  },
  { timestamps: true }
);

GatherItemSchema.index({ userId: 1, clusters: 1, status: 1 });
GatherItemSchema.index({ userId: 1, list: 1, status: 1 });
GatherItemSchema.index({ userId: 1, list: 1, normalizedTitle: 1, status: 1 });

export default mongoose.model('GatherItem', GatherItemSchema);
