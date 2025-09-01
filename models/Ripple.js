// models/Ripple.js
import mongoose from 'mongoose';

const RippleSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true, required: true },
    entryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Entry' },
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
  },
  { timestamps: true }
);

// quick daily indexing
RippleSchema.index({ userId: 1, dateKey: 1, status: 1, createdAt: -1 });

export default mongoose.model('Ripple', RippleSchema);
