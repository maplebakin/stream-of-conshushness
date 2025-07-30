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
  content: String,
  mood: String,
  linkedGoal: {
    type: String,
    ref: 'Goal'
  },
  cluster: {
  type: String,
},

}, { timestamps: true });

export default mongoose.model('Entry', entrySchema);
