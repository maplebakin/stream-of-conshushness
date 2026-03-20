// models/ResearchSubject.js
import mongoose from 'mongoose';

const { Schema, Types: { ObjectId } } = mongoose;

const sourceSchema = new Schema({
  citation:    { type: String, default: '' },
  url:         { type: String, default: '' },
  reliability: { type: String, enum: ['primary', 'secondary', 'tertiary', 'unknown'], default: 'unknown' },
}, { _id: true });

const researchSubjectSchema = new Schema(
  {
    userId:    { type: ObjectId, ref: 'User',    required: true, index: true },
    sectionId: { type: ObjectId, ref: 'Section', required: true, index: true },

    // Identity
    name:           { type: String, required: true, trim: true },
    slug:           { type: String, required: true, trim: true },
    alternateNames: [{ type: String, trim: true }],
    gender:         { type: String, enum: ['male', 'female', 'unknown', ''], default: '' },

    // Vital dates (stored as strings to allow "c. 1850", "bef. 1900", etc.)
    birthDate:   { type: String, default: '' },
    birthPlace:  { type: String, default: '' },
    deathDate:   { type: String, default: '' },
    deathPlace:  { type: String, default: '' },
    burialPlace: { type: String, default: '' },

    occupation: { type: String, default: '' },

    // Relationships (ObjectId refs to other ResearchSubjects in same section)
    parentIds: [{ type: ObjectId, ref: 'ResearchSubject' }],
    spouseIds: [{ type: ObjectId, ref: 'ResearchSubject' }],

    // Research content
    notes:   { type: String, default: '' },   // markdown
    sources: [sourceSchema],
    tags:    [{ type: String, trim: true }],
  },
  { timestamps: true }
);

researchSubjectSchema.index({ userId: 1, sectionId: 1 });
researchSubjectSchema.index({ userId: 1, sectionId: 1, slug: 1 }, { unique: true });

export default mongoose.model('ResearchSubject', researchSubjectSchema);
