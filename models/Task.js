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
    status     : { type: String, enum: ['todo', 'doing', 'done'], default: 'todo', index: true },

    // Multi tags
    clusters   : { type: [mongoose.Schema.Types.ObjectId], ref: 'Cluster', default: [] },
    sections   : { type: [String], default: [], index: true },

    // Recurrence (aligns with UI)
    rrule      : { type: String, default: '' },

    entryId    : { type: mongoose.Schema.Types.ObjectId, ref: 'Entry', default: null },
    goalId     : { type: mongoose.Schema.Types.ObjectId, ref: 'Goal', default: null },
  },
  { timestamps: true }
);

// Legacy convenience: singular cluster (id string)
taskSchema.virtual('cluster')
  .get(function () {
    const first = this.clusters?.[0];
    return first ? first.toString() : '';
  })
  .set(function (val) {
    if (!val) return;
    const str = typeof val === 'string' ? val.trim() : val?.toString?.();
    if (!str || !mongoose.Types.ObjectId.isValid(str)) return;
    const id = new mongoose.Types.ObjectId(str);
    const key = id.toString();
    const existing = Array.isArray(this.clusters)
      ? this.clusters.map((c) => (c instanceof mongoose.Types.ObjectId ? c.toString() : c?.toString?.()))
      : [];
    if (existing.includes(key)) return;
    this.clusters = [id, ...(Array.isArray(this.clusters) ? this.clusters : [])];
  });

// Singular section (for easy form binding)
taskSchema.virtual('section')
  .get(function () { return this.sections?.[0] || ''; })
  .set(function (val) {
    if (typeof val !== 'string' || !val.trim()) return;
    const key = val.trim();
    if (!Array.isArray(this.sections) || this.sections.length === 0) this.sections = [key];
    else if (!this.sections.includes(key)) this.sections.unshift(key);
  });

taskSchema.pre('save', function(next) {
  if (this.isModified('status')) {
    if (this.status === 'done' && !this.completed) {
      this.completed = true;
    } else if (this.status !== 'done' && this.completed) {
      this.completed = false;
    }
  }

  if (this.isModified('completed')) {
    this.completedAt = this.completed ? new Date() : null;
    if (this.completed) {
      this.status = 'done';
    } else if (this.status === 'done') {
      this.status = 'todo';
    }
  }

  next();
});

taskSchema.index({ userId: 1, clusters: 1 });

export default mongoose.model('Task', taskSchema);
