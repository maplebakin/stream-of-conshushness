import mongoose from 'mongoose';

const entrySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  date: String,
  section: String,
  tags: [String],
  content: String
}, { timestamps: true });

export default mongoose.model('Entry', entrySchema);
