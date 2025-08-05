// models/Task.js
import mongoose from 'mongoose';

const taskSchema = new mongoose.Schema(
  {
    /* ownership */
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    /* core */
    title  : { type: String, required: true },       // short label shown in lists
    content: { type: String },                       // optional longer notes
    priority: { type: String, enum: ['high','medium','low'], default: 'low' },

    /* scheduling */
    dueDate: { type: Date },
    repeat : { type: String },                       // e.g. "weekly", "monthly"

    /* links */
    completed : { type: Boolean, default: false },
    entryId   : { type: mongoose.Schema.Types.ObjectId, ref: 'Entry' },
    goalId    : { type: mongoose.Schema.Types.ObjectId, ref: 'Goal' },
    cluster   : { type: String }
  },
  { timestamps: true }
);

export default mongoose.models.Task || mongoose.model('Task', taskSchema);
