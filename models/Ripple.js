import mongoose from 'mongoose';

const rippleSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  
  // Source information
  sourceEntryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Entry', required: true },
  extractedText: { type: String, required: true },
  originalContext: { type: String, required: true },
  
  // Ripple classification
  type: { 
    type: String, 
    enum: ['suggestedTask', 'recurringTask', 'appointment', 'importantEvent', 'yearlyEvent'],
    required: true 
  },
  confidence: { 
    type: String, 
    enum: ['high', 'medium', 'low'], 
    required: true 
  },
  
  // Status tracking
  status: { 
    type: String, 
    enum: ['pending', 'approved', 'dismissed'], 
    default: 'pending' 
  },
  
  // When approved, track what it became
  createdTaskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task' },
  createdAppointmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment' },
  createdEventId: { type: mongoose.Schema.Types.ObjectId, ref: 'ImportantEvent' },
  assignedCluster: { type: String },
  
  
  // Metadata
  entryDate: { type: String, required: true }, // format: 'YYYY-MM-DD'
  extractedDate: { type: Date, default: Date.now },
  processedDate: { type: Date }
}, {
  timestamps: true
});

export default mongoose.model('Ripple', rippleSchema);