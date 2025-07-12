import mongoose from 'mongoose';

const appointmentSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: String, required: true },
  time: { type: String, required: true },
  details: { type: String, required: true }
}, { timestamps: true });

export default mongoose.model('Appointment', appointmentSchema);
