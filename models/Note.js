import mongoose from 'mongoose';

const noteSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: String, required: true },
  content: { type: String, default: '' },
  cluster: { type: String }, // optional
  clusters: { type: [mongoose.Schema.Types.ObjectId], ref: 'Cluster', default: [] },
  entryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Entry' }, // optional
  // Stable identity for the unclustered "Remember This" note for a day.
  // Clustered/general notes intentionally leave this null.
  dailyKey: { type: String, default: null },
}, { timestamps: true });

noteSchema.index({ userId: 1, clusters: 1, date: -1 });
noteSchema.index(
  { userId: 1, dailyKey: 1 },
  { unique: true, partialFilterExpression: { dailyKey: { $type: 'string' } } }
);

const Note = mongoose.model('Note', noteSchema);
export default Note;
