// models/Task.js
import mongoose from 'mongoose';

const PRIORITIES = ['high','medium','low']; // display intent

const taskSchema = new mongoose.Schema(
  {
    /* ownership */
    userId   : { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    /* core */
    title    : { type: String, required: true, trim: true, minlength: 1, maxlength: 280 },
    notes    : { type: String, trim: true },
    priority : { type: String, enum: PRIORITIES, default: 'low' },

    /* scheduling */
    dueDate  : { type: Date },         // store midnight UTC or precise time — your choice
    repeat   : { type: String, trim: true }, // future: upgrade to RRULE string

    /* links & state */
    completed: { type: Boolean, default: false, index: true },
    entryId  : { type: mongoose.Schema.Types.ObjectId, ref: 'Entry' },
    goalId   : { type: mongoose.Schema.Types.ObjectId, ref: 'Goal' },
    clusters : {
      type: [String],
      default: [],
      set: (arr) => Array.from(new Set((arr || []).map(s => String(s).trim()).filter(Boolean)))
    }
  },
  { timestamps: true }
);

/* Indexes for common queries/sorts */
taskSchema.index({ userId: 1, dueDate: 1, completed: 1 });
taskSchema.index({ userId: 1, createdAt: 1 });

/* Virtual/computed sort helper for priority (high > medium > low) */
const prioOrder = { high: 0, medium: 1, low: 2 };
taskSchema.statics.sortForLists = function() {
  // emulate { completed: 1, dueDate: 1, priorityCustom: 1, createdAt: 1 }
  return (a, b) => {
    if (a.completed !== b.completed) return a.completed - b.completed;
    const ad = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
    const bd = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
    if (ad !== bd) return ad - bd;
    const ap = prioOrder[a.priority] ?? 99;
    const bp = prioOrder[b.priority] ?? 99;
    if (ap !== bp) return ap - bp;
    return new Date(a.createdAt) - new Date(b.createdAt);
  };
};

/* Day window helper (timezone‑aware) */
function dayRangeFromISO(isoDate, timeZone = 'America/Toronto') {
  // Build a local midnight range, then convert to UTC dates for the DB
  const d = new Date(`${isoDate}T00:00:00`);
  // Use Intl to get local offset boundaries
  const startLocal = new Date(new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  }).format(d).replace(',',''));
  const start = new Date(startLocal.toISOString().slice(0,10) + 'T00:00:00.000Z');
  const end   = new Date(start.getTime() + 24*60*60*1000);
  return { start, end };
}

taskSchema.statics.findForDay = async function(userId, isoDate, tz = 'America/Toronto') {
  const { start, end } = dayRangeFromISO(isoDate, tz);
  return this.find({ userId, dueDate: { $gte: start, $lt: end } });
};

/* Carry forward helper */
taskSchema.methods.carryForward = async function(days = 1) {
  const d = this.dueDate ? new Date(this.dueDate) : new Date();
  d.setUTCDate(d.getUTCDate() + (Number.isFinite(days) ? days : 1));
  this.dueDate = d;
  this.completed = false;
  return this.save();
};

export default mongoose.models.Task || mongoose.model('Task', taskSchema);
