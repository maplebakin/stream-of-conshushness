// models/Section.js
import mongoose from 'mongoose';

const sectionSchema = new mongoose.Schema(
  {
    userId    : { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    key       : { type: String, required: true },  // slug-ish, unique per user
    label     : { type: String, required: true },  // display name
    color     : { type: String, default: '#5cc2ff' },
    icon      : { type: String, default: '📚' },
    description: { type: String, default: '' },
    pinned    : { type: Boolean, default: false },
    order     : { type: Number, default: 0 },
  },
  { timestamps: true }
);

sectionSchema.index({ userId: 1, key: 1 }, { unique: true });

export default mongoose.model('Section', sectionSchema);
