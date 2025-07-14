import mongoose from 'mongoose';

const DailyScheduleSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: String, required: true }, // "YYYY-MM-DD"
  hour: { type: String, required: true }, // "08", "09", etc.
  text: { type: String, default: "" }
});

export default mongoose.model('DailySchedule', DailyScheduleSchema);
