// models/Ripple.js
import mongoose from 'mongoose';

const rippleSchema = new mongoose.Schema(
  {
    /*  Who + where  */
    userId       : { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    sourceEntryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Entry', required: true },
    entryDate    : { type: String, required: true },   // 'YYYY-MM-DD'

    /*  Core text  */
    extractedText  : { type: String, required: true },
    originalContext: { type: String, required: true },

    /*  Classification  */
    type: {
      type : String,
      enum : [
        'urgentTask','suggestedTask','procrastinatedTask','recurringTask',
        'appointment','deadline','goal','wishlistItem','decision','concern',
        'gratitude','learning','habitForming','habitBreaking','moodIndicator',
        'importantEvent','yearlyEvent'
      ],
      required: true
    },
    priority       : { type: String, enum: ['high','medium','low'] },
    timeSensitivity: { type: String },        // immediate / scheduled / long-term
    contexts       : [{ type: String }],

    /*  New scheduling helpers  */
    dueDate   : { type: Date },               // parsed by chrono-node
    recurrence: { type: String },             // 'daily' | 'weekly' | …

    /*  Mood snapshots  */
    mood: {
      local : { type: Object },               // analysis of snippet
      entry : { type: Object }                // analysis of whole entry
    },

    confidence : { type: Number, min: 0, max: 1 },

    /*  Moderation flow  */
    status              : { type: String, enum: ['pending','approved','dismissed'], default: 'pending' },
    createdTaskId       : { type: mongoose.Schema.Types.ObjectId, ref: 'Task' },
    createdAppointmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment' },
    createdEventId      : { type: mongoose.Schema.Types.ObjectId, ref: 'ImportantEvent' },
    assignedCluster     : { type: String },

    /*  Meta  */
    metadata      : { type: Object, default: {} },
    extractedDate : { type: Date, default: Date.now },
    processedDate : { type: Date }
  },
  { timestamps: true }
);

export default mongoose.model('Ripple', rippleSchema);
