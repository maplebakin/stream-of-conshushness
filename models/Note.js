import mongoose from 'mongoose';

const noteSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: String, required: true },
  content: { type: String, default: '' },
  cluster: { type: String }, // optional
  clusters: { type: [mongoose.Schema.Types.ObjectId], ref: 'Cluster', default: [] },
  entryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Entry' }, // optional
}, { timestamps: true });

noteSchema.index({ userId: 1, clusters: 1, date: -1 });

const Note = mongoose.model('Note', noteSchema);
export default Note;
