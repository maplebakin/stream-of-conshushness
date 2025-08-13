// models/Task.js
import mongoose from 'mongoose';

const taskSchema = new mongoose.Schema(
  {
    userId   : { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    title    : { type: String, required: true },
    details  : { type: String, default: '' },

    completed: { type: Boolean, default: false, index: true },
    priority : { type: String, enum: ['low','normal','high','urgent'], default: 'low' },

    // Scheduling
    dueDate  : { type: String, default: null, index: true }, // 'YYYY-MM-DD' or null
    // Accept structured recurrence objects OR legacy strings
    // e.g., { unit:'day', interval:2 }, { unit:'week', interval:1, byDay:['MO'] }, or "daily"
    repeat   : { type: mongoose.Schema.Types.Mixed, default: null },

    // Clusters — keep legacy single + new multi
    cluster  : { type: String, default: '' },         // legacy
    clusters : { type: [String], default: [] },       // new

    // Links
    entryId        : { type: mongoose.Schema.Types.ObjectId, ref: 'Entry',  default: null },
    goalId         : { type: mongoose.Schema.Types.ObjectId, ref: 'Goal',   default: null },
    sourceRippleId : { type: mongoose.Schema.Types.ObjectId, ref: 'Ripple', default: null }
  },
  { timestamps: true }
);

// tiny helper index combo for common queries
taskSchema.index({ userId: 1, completed: 1, dueDate: 1 });

export default mongoose.model('Task', taskSchema);
