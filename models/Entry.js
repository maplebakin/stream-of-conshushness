// backend/models/Entry.js
import mongoose from 'mongoose';

const { Schema } = mongoose;

/** Status of suggestions as they move through review */
const SUGGEST_STATUS = ['new', 'accepted', 'dismissed'];

/* ── Suggested subdocs ─────────────────────────────────────── */
const SuggestedTaskSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    dueDate: { type: String },            // 'YYYY-MM-DD'
    repeat: { type: String },             // 'daily', 'every tuesday', etc.
    cluster: { type: String },
    status: { type: String, enum: SUGGEST_STATUS, default: 'new' },
    confidence: { type: Number, default: 0.6 },
  },
  { _id: true, timestamps: true }
);

const SuggestedApptSchema = new Schema(
  {
    date: { type: String },               // 'YYYY-MM-DD'
    time: { type: String },               // 'HH:mm'
    details: { type: String, trim: true },
    cluster: { type: String },
    status: { type: String, enum: SUGGEST_STATUS, default: 'new' },
    confidence: { type: Number, default: 0.6 },
  },
  { _id: true, timestamps: true }
);

const SuggestedEventSchema = new Schema(
  {
    name: { type: String, trim: true },
    date: { type: String },               // 'YYYY-MM-DD'
    yearly: { type: Boolean, default: false },
    status: { type: String, enum: SUGGEST_STATUS, default: 'new' },
    confidence: { type: Number, default: 0.6 },
  },
  { _id: true, timestamps: true }
);

/* ── Entry schema ───────────────────────────────────────────── */
const EntrySchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    // Day the entry belongs to (YYYY-MM-DD)
    date: {
      type: String,
      required: true,
      default: () => new Date().toISOString().slice(0, 10),
    },

    // Core journaling content
    text: { type: String, required: true, trim: true },
    mood: { type: String, trim: true }, // free text for now (happy, meh, etc.)

    // Optional rich/legacy content echoes for immediate client render
    html: { type: String, default: '' },
    content: { type: String, default: '' }, // legacy

    // Optional manual assignments (filled later during review)
    tags: {
      type: [String],
      default: [],
      set: (a) =>
        Array.from(
          new Set((a || []).map((s) => String(s).trim()).filter(Boolean))
        ),
    },
    cluster: { type: String, trim: true },
    linkedGoal: { type: Schema.Types.ObjectId, ref: 'Goal' },

    // Auto-suggested ripples (review on Daily Page)
    suggestedTasks: { type: [SuggestedTaskSchema], default: [] },
    suggestedAppointments: { type: [SuggestedApptSchema], default: [] },
    suggestedEvents: { type: [SuggestedEventSchema], default: [] },

    // Soft suggestions for classification (no force at creation)
    suggestedTags: { type: [String], default: [] },
    suggestedClusters: { type: [String], default: [] },

    // Review flow
    reviewedAt: { type: Date }, // set when user hits "Mark reviewed"
  },
  { timestamps: true }
);

// Helpful indexes for common queries/sorts
EntrySchema.index({ userId: 1, createdAt: -1 });
EntrySchema.index({ userId: 1, date: -1, createdAt: -1 });

export default mongoose.model('Entry', EntrySchema);
