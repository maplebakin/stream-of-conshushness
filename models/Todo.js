import mongoose from 'mongoose';

const taskSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  content: { type: String, required: true }, // task description

  // Linkages
  entryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Entry', default: null },
  linkedGoal: { type: mongoose.Schema.Types.ObjectId, ref: 'Goal', default: null },
  cluster: { type: String, default: null }, // soft label for now, can ref later

  // Timing
  dueDate: { type: Date, default: null },
  repeat: { type: String, default: null }, // e.g. "weekly", "every Tuesday"
  completed: { type: Boolean, default: false },

}, { timestamps: true });

export default mongoose.model('Task', taskSchema); // you can keep this 'Todo' if needed
