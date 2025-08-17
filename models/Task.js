// models/Task.js
import mongoose from 'mongoose';

const taskSchema = new mongoose.Schema(
  {
    userId     : { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title      : { type: String, required: true },
    notes      : { type: String, default: '' },
    dueDate    : { type: String, default: null },           // 'YYYY-MM-DD' or null
    completed  : { type: Boolean, default: false, index: true },
    completedAt: { type: Date, default: null },
    priority   : { type: Number, default: 0 },

    // existing clusters support
    clusters   : { type: [String], default: [], index: true },

    // NEW: sections support (multi)
    sections   : { type: [String], default: [], index: true },

    entryId    : { type: mongoose.Schema.Types.ObjectId, ref: 'Entry', default: null },
    goalId     : { type: mongoose.Schema.Types.ObjectId, ref: 'Goal', default: null },
  },
  { timestamps: true }
);

// Legacy convenience: singular cluster
taskSchema.virtual('cluster')
  .get(function () { return this.clusters?.[0] || ''; })
  .set(function (val) {
    if (typeof val !== 'string' || !val.trim()) return;
    const key = val.trim();
    if (!Array.isArray(this.clusters) || this.clusters.length === 0) this.clusters = [key];
    else if (!this.clusters.includes(key)) this.clusters.unshift(key);
  });

// NEW: singular section (for easy form binding)
taskSchema.virtual('section')
  .get(function () { return this.sections?.[0] || ''; })
  .set(function (val) {
    if (typeof val !== 'string' || !val.trim()) return;
    const key = val.trim();
    if (!Array.isArray(this.sections) || this.sections.length === 0) this.sections = [key];
    else if (!this.sections.includes(key)) this.sections.unshift(key);
  });

taskSchema.pre('save', function(next) {
  if (this.isModified('completed')) {
    this.completedAt = this.completed ? new Date() : null;
  }
  next();
});

export default mongoose.model('Task', taskSchema);
