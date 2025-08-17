// models/Cluster.js
import mongoose from 'mongoose';

function slugifyKey(s = '') {
  return String(s)
    .toLowerCase()
    .trim()
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

const clusterSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    key:    { type: String, required: true },  // canonical, lowercased slug
    label:  { type: String, required: true },
    color:  { type: String, default: '#9b87f5' },
    icon:   { type: String, default: '🗂️' },
    description: { type: String, default: '' },
    pinned: { type: Boolean, default: true },
    order:  { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Always store a canonical key
clusterSchema.pre('validate', function(next) {
  if (this.key) this.key = slugifyKey(this.key);
  next();
});

// Unique per user, case-insensitive (collation handles case-insensitive dupes)
clusterSchema.index(
  { userId: 1, key: 1 },
  { unique: true, collation: { locale: 'en', strength: 2 } }
);

export default mongoose.model('Cluster', clusterSchema);
export { slugifyKey };
