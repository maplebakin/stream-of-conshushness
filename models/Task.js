import mongoose from 'mongoose';

const taskSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  content: { type: String, required: true },
  dueDate: { type: Date },
  repeat: { type: String },
  completed: { type: Boolean, default: false },
  entryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Entry' },
  goalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Goal' },
  cluster: { type: String },
}, { timestamps: true });

export default mongoose.model('Task', taskSchema);
