import mongoose from 'mongoose';

const GameSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true },
  slug: { type: String, required: true },
  description: { type: String },
  imageUrl: { type: String },
  createdAt: { type: Date, default: Date.now }
});

GameSchema.index({ userId: 1, slug: 1 }, { unique: true });

export default mongoose.model('Game', GameSchema);
