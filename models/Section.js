// models/Section.js
import mongoose from 'mongoose';

const { Schema } = mongoose;

const sectionSchema = new Schema(
  {
    ownerId:     { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title:       { type: String, required: true, trim: true },
    slug:        { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    icon:        { type: String, default: '' },
    theme:       { type: Schema.Types.Mixed, default: () => ({}) },
    layout:      { type: String, enum: ['flow', 'grid', 'kanban', 'tree'], default: 'flow' },
    public:      { type: Boolean, default: false },
  },
  { timestamps: true }
);

sectionSchema.index({ ownerId: 1, slug: 1 }, { unique: true });
sectionSchema.index({ updatedAt: -1 });

export default mongoose.model('Section', sectionSchema);
