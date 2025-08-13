// models/Entry.js
import mongoose from 'mongoose';

const { Schema } = mongoose;

const SuggestedTaskSchema = new Schema({
  title   : { type: String, required: true, trim: true },
  dueDate : { type: String, default: '' },  // YYYY-MM-DD
  repeat  : { type: String, default: '' },
  cluster : { type: String, default: '' },
  status  : { type: String, enum: ['new','accepted','dismissed'], default: 'new' }
}, { _id: false });

const EntrySchema = new Schema({
  userId : { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  date   : { type: String, required: true }, // YYYY-MM-DD
  text   : { type: String, default: '', trim: true },
  html   : { type: String, default: '' },
  content: { type: String, default: '' },
  mood   : { type: String, default: '' },
  cluster: { type: String, default: '' },
  section: { type: String, default: '' }, // legacy / optional
  tags   : { type: [String], default: [] },
  linkedGoal: { type: Schema.Types.ObjectId, ref: 'Goal', default: null },

  suggestedTasks: { type: [SuggestedTaskSchema], default: [] }
}, { timestamps: true });

export default mongoose.model('Entry', EntrySchema);
