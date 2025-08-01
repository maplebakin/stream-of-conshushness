import mongoose from 'mongoose';

const appointmentSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: String, required: true },                     // e.g., "2025-08-01"
  time: { type: String, required: true },                     // e.g., "14:00"
  details: { type: String, required: true },                  // e.g., "Dentist appointment"
  cluster: { type: String },                                  // Optional: "Home", "Colton", etc.
  entryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Entry' } // Optional: link back to entry
}, { timestamps: true });

export default mongoose.model('Appointment', appointmentSchema);
