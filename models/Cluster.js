// backend/models/Cluster.js
import mongoose from 'mongoose';
const { Schema } = mongoose;

const ClusterSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', index: true, required: true },
  name: { type: String, required: true, trim: true },
  color: { type: String, default: '#9ecae1' }, // soft default
  // soft linking — we won’t enforce arrays of ObjectIds until needed
  // entries/tasks/goals can query by cluster/name
  archived: { type: Boolean, default: false },
}, { timestamps: true });

ClusterSchema.index({ userId: 1, name: 1 }, { unique: true });

export default mongoose.model('Cluster', ClusterSchema);
