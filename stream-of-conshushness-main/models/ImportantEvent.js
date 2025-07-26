import mongoose from 'mongoose';

const importantEventSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true },
  date: { type: String, required: true }
}, { timestamps: true });

export default mongoose.model('ImportantEvent', importantEventSchema);
