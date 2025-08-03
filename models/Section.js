// models/Section.js
import mongoose from 'mongoose';

const SectionSchema = new mongoose.Schema(
  {
    name:       { type: String, required: true, trim: true },
    slug:       { type: String, required: true, trim: true, unique: true },
    icon:       { type: String, default: '' },   // e.g. lucide icon name
    color:      { type: String, default: '#aaaaaa' },
    owner:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
  },
  { timestamps: true }
);

export default mongoose.model('Section', SectionSchema);
