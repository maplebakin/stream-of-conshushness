import mongoose from 'mongoose';
import bcrypt from 'bcrypt';

const userSchema = new mongoose.Schema(
  {
    username:    { type: String, required: true, unique: true, index: true },
    email:       { type: String, default: '', trim: true, lowercase: true, index: true },
    // New and verified email writes populate this canonical identity key. Keeping
    // it nullable lets legacy users and username-only accounts coexist safely.
    emailNormalized: { type: String, default: null, trim: true, lowercase: true },
    passwordHash:{ type: String, required: true },

    // Incrementing this invalidates every JWT issued with an older version.
    // Legacy users and tokens intentionally resolve to version 0.
    authVersion: { type: Number, default: 0, min: 0 },

    isAdmin: { type: Boolean, default: false },

    // Profile customization
    profilePicture: { type: String, default: '' }, // URL or filename of uploaded profile picture

    // Password reset flow
    resetTokenHash: { type: String, default: null },
    resetTokenExpiry: { type: Date, default: null },
    resetCodeHash: { type: String, default: null },
    resetCodeExpiry: { type: Date, default: null },

    // Email verification flow (for adding/changing email)
    pendingEmail: { type: String, default: '', trim: true, lowercase: true },
    emailVerifyCodeHash: { type: String, default: null },
    emailVerifyCodeExpiry: { type: Date, default: null },
    emailVerifiedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

userSchema.index(
  { emailNormalized: 1 },
  {
    unique: true,
    partialFilterExpression: { emailNormalized: { $type: 'string' } },
    name: 'user_email_normalized_unique',
  }
);

userSchema.pre('validate', function keepEmailIdentityCanonical() {
  if (!this.isModified('email')) return;
  const normalized = String(this.email || '').trim().toLowerCase();
  this.email = normalized;
  this.emailNormalized = normalized || null;
});

userSchema.methods.setPassword = async function (password) {
  this.passwordHash = await bcrypt.hash(password, 10);
};
userSchema.methods.validatePassword = async function (password) {
  return bcrypt.compare(password, this.passwordHash);
};

export default mongoose.model('User', userSchema);
