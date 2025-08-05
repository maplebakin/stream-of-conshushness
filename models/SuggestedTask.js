// models/SuggestedTask.js
import mongoose from 'mongoose';

const suggestedTaskSchema = new mongoose.Schema(
  {
    /* ownership / linkage */
    userId       : { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    sourceRippleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ripple', required: true },

    /* draft data */
    title     : { type: String, required: true },
    priority  : { type: String, enum: ['high','medium','low'], default: 'low' },
    dueDate   : { type: Date },          // populated by chrono parser if present
    repeat    : { type: String },        // 'weekly', 'monthly', etc.
    cluster   : { type: String },

    /* review state */
    status    : { type: String, enum: ['pending','accepted','rejected'], default: 'pending' }
  },
  { timestamps: true }
);

export default mongoose.model('SuggestedTask', suggestedTaskSchema);
