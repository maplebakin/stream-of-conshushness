import mongoose from 'mongoose';

const GoalSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  cluster: { type: String }, // Optional: tie to a life domain
  clusters: { type: [mongoose.Schema.Types.ObjectId], ref: 'Cluster', default: [] },
  title: { type: String, required: true },
  description: { type: String },
  steps: [
    {
      content: String,
      completed: { type: Boolean, default: false },
    }
  ],
  createdAt: { type: Date, default: Date.now }
});

GoalSchema.index({ userId: 1, clusters: 1 });

export default mongoose.model('Goal', GoalSchema);
