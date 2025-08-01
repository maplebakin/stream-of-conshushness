import mongoose from 'mongoose';

const noteSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: String, required: true },
  content: { type: String, default: '' },
  cluster: { type: String }, // new
  entryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Entry' }, // new
}, { timestamps: true });

export default mongoose.model('Note', noteSchema);
