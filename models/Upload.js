import mongoose from 'mongoose';

const uploadSchema = new mongoose.Schema(
  {
    fileId: { type: String, required: true, unique: true, index: true },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    originalName: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true, min: 1 },
    storageName: { type: String, required: true, unique: true },
    resourceType: { type: String, default: 'unattached', index: true },
    resourceId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true }
);

uploadSchema.index({ ownerId: 1, fileId: 1 });
uploadSchema.index({ ownerId: 1, resourceType: 1, resourceId: 1, deletedAt: 1 });

export default mongoose.model('Upload', uploadSchema);
