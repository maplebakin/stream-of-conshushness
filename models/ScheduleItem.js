import mongoose from 'mongoose';
const ScheduleItemSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true, required: true },
  date:   { type: String, required: true }, // 'YYYY-MM-DD'
  hour:   { type: String, required: true }, // '08:00'...'18:00'
  text:   { type: String, default: '' },
}, { timestamps: true });

ScheduleItemSchema.index({ userId: 1, date: 1, hour: 1 }, { unique: true });
export default mongoose.model('ScheduleItem', ScheduleItemSchema);
