import mongoose from 'mongoose';

const GameNoteSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  gameId: { type: mongoose.Schema.Types.ObjectId, ref: 'Game', required: true },
  content: { type: String, default: '' },
  updatedAt: { type: Date, default: Date.now }
});

export default mongoose.model('GameNote', GameNoteSchema);
