import mongoose from 'mongoose';

const habitSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true },
  cluster: { type: String }, // tie to a life area
  repeat: { type: String }, // e.g., daily, weekly, custom
  history: [{ type: String }], // ISO date strings
}, { timestamps: true });

export default mongoose.model('Habit', habitSchema);
