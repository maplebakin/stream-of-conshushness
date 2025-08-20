// models/SectionPage.js
import mongoose from 'mongoose';

const { Schema } = mongoose;

const sectionPageSchema = new Schema(
  {
    userId:     { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    sectionKey: { type: String, required: true, index: true },   // matches Section.key
    slug:       { type: String, required: true },                 // derived from title
    title:      { type: String, required: true, trim: true },
    body:       { type: String, default: '' },                    // markdown / html / plain
    icon:       { type: String, default: '' },                    // optional emoji/icon
    order:      { type: Number, default: 0 },
    visibility: { type: String, enum: ['public','private'], default: 'private' }
  },
  { timestamps: true }
);

// Unique per user within a section
sectionPageSchema.index({ userId: 1, sectionKey: 1, slug: 1 }, { unique: true });

export default mongoose.model('SectionPage', sectionPageSchema);
