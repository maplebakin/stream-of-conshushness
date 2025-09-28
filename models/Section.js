// models/Section.js
import mongoose from 'mongoose';

const { Schema } = mongoose;

const sectionSchema = new Schema(
  {
    ownerId:     { type: Schema.Types.ObjectId, ref: 'User', index: true },
    userId:      { type: Schema.Types.ObjectId, ref: 'User', index: true },
    title:       { type: String, trim: true },
    label:       { type: String, trim: true },
    slug:        { type: String, trim: true },
    key:         { type: String, trim: true },
    description: { type: String, default: '' },
    icon:        { type: String, default: '' },
    color:       { type: String, default: '#5cc2ff' },
    theme:       { type: Schema.Types.Mixed, default: () => ({}) },
    layout:      { type: String, enum: ['flow', 'grid', 'kanban', 'tree'], default: 'flow' },
    public:      { type: Boolean, default: false },
    pinned:      { type: Boolean, default: false },
    order:       { type: Number, default: 0 },
  },
  { timestamps: true }
);

sectionSchema.index(
  { ownerId: 1, slug: 1 },
  { unique: true, partialFilterExpression: { ownerId: { $exists: true }, slug: { $exists: true, $ne: null } } }
);
sectionSchema.index(
  { userId: 1, key: 1 },
  { unique: true, partialFilterExpression: { userId: { $exists: true }, key: { $exists: true, $ne: null } } }
);
sectionSchema.index({ updatedAt: -1 });

sectionSchema.pre('validate', function syncLegacyFields(next) {
  if (!this.ownerId && this.userId) {
    this.ownerId = this.userId;
  }
  if (!this.userId && this.ownerId) {
    this.userId = this.ownerId;
  }

  if (!this.slug && this.key) {
    this.slug = this.key;
  }
  if (!this.key && this.slug) {
    this.key = this.slug;
  }

  if (!this.title && this.label) {
    this.title = this.label;
  }
  if (!this.label && this.title) {
    this.label = this.title;
  }

  if (!this.icon && this.emoji) {
    this.icon = this.emoji;
  }

  if (!this.theme) {
    this.theme = {};
  }

  next();
});

export default mongoose.model('Section', sectionSchema);
