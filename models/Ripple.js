// models/Ripple.js
import mongoose from 'mongoose';

const rippleSchema = new mongoose.Schema(
  {
    /* Who + where */
    userId       : { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    sourceEntryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Entry', required: true, index: true },
    entryDate    : { type: String, required: true },   // 'YYYY-MM-DD'

    /* Core text */
    extractedText  : { type: String, required: true },
    originalContext: { type: String, required: true },

    /* Classification */
    type: {
      type: String,
      enum: [
        'urgentTask','suggestedTask','procrastinatedTask','recurringTask',
        'appointment','deadline','goal','wishlistItem','decision','concern',
        'gratitude','learning','habitForming','habitBreaking','moodIndicator',
        'importantEvent','yearlyEvent'
      ],
      default: 'suggestedTask'
    },
    priority: {
      type: String,
      enum: ['low','normal','high','urgent'],
      default: 'low'
    },

    /* Assignment (clusters) */
    assignedCluster : { type: String, default: null },
    assignedClusters: { type: [String], default: [] },

    /* Optional context tags */
    contexts: { type: [String], default: [] },

    /* Scheduling hints */
    dueDate   : { type: String, default: null },                  // 'YYYY-MM-DD' or null
    recurrence: { type: mongoose.Schema.Types.Mixed, default: null }, // e.g., { unit:'day', interval:2 }

    /* Workflow */
    status: {
      type: String,
      enum: ['pending','approved','dismissed'],
      default: 'pending',
      index: true
    },
    createdTaskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', default: null }
  },
  { timestamps: true }
);

export default mongoose.model('Ripple', rippleSchema);
