import mongoose from 'mongoose';

const noteSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: String, required: true },
  content: { type: String, default: '' },
  cluster: { type: String }, // optional
  entryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Entry' }, // optional
}, { timestamps: true });

const Note = mongoose.model('Note', noteSchema);
export default Note;
