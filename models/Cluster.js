import mongoose from 'mongoose';

function slugifyClusterSlug(value = '') {
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

const clusterSchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    name: {
      type: String,
      required: true,
      trim: true
    },
    slug: {
      type: String,
      required: true
    },
    color: {
      type: String,
      default: '#9b87f5'
    },
    icon: {
      type: String,
      default: '🗂️'
    }
  },
  { timestamps: true }
);

clusterSchema.pre('validate', function clusterPreValidate(next) {
  if (this.name) {
    this.name = this.name.trim();
  }

  const slugSource = this.slug || this.name;
  if (slugSource) {
    this.slug = slugifyClusterSlug(slugSource);
  }

  if (!this.slug) {
    this.invalidate('slug', 'Slug is required.');
  }

  next();
});

clusterSchema.index({ ownerId: 1, slug: 1 }, { unique: true });

export default mongoose.model('Cluster', clusterSchema);
export { slugifyClusterSlug };
