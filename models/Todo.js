import mongoose from 'mongoose';

const todoSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  date: { type: String, required: true },
  items: { type: Array, default: [] }
}, { timestamps: true });

export default mongoose.model('Todo', todoSchema);
