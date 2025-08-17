import mongoose from 'mongoose';
import bcrypt from 'bcrypt';

const userSchema = new mongoose.Schema(
  {
    username:    { type: String, required: true, unique: true, index: true },
    email:       { type: String, default: '', index: true },   // verified email (once confirmed)
    passwordHash:{ type: String, required: true },

    isAdmin: { type: Boolean, default: false },

    // Password reset flow
    resetTokenHash: { type: String, default: null },
    resetTokenExpiry: { type: Date, default: null },
    resetCodeHash: { type: String, default: null },
    resetCodeExpiry: { type: Date, default: null },

    // Email verification flow (for adding/changing email)
    pendingEmail: { type: String, default: '' },
    emailVerifyCodeHash: { type: String, default: null },
    emailVerifyCodeExpiry: { type: Date, default: null },
    emailVerifiedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

userSchema.methods.setPassword = async function (password) {
  this.passwordHash = await bcrypt.hash(password, 10);
};
userSchema.methods.validatePassword = async function (password) {
  return bcrypt.compare(password, this.passwordHash);
};

export default mongoose.model('User', userSchema);
