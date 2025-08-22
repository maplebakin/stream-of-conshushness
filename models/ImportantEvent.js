// models/ImportantEvent.js
import mongoose from 'mongoose';

const ImportantEventSchema = new mongoose.Schema(
  {
    userId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title:    { type: String, required: true, trim: true },
    date:     { type: String, required: true }, // 'YYYY-MM-DD'

    // Keep both to be friendly with different callers
    description: { type: String, default: '' },
    details:     { type: String, default: '' },

    cluster:  { type: String, default: null },
  },
  { timestamps: true }
);

// Avoid dupes for the same (user, date, title)
ImportantEventSchema.index(
  { userId: 1, date: 1, title: 1 },
  { unique: true }
);

export default mongoose.model('ImportantEvent', ImportantEventSchema);
