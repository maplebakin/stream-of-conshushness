import mongoose from 'mongoose';
import bcrypt from 'bcrypt';

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, index: true },
    email: { type: String, default: '' },
    passwordHash: { type: String, required: true },

    // Admin flag
    isAdmin: { type: Boolean, default: false },   // ← add this

    // Password reset artifacts
    resetTokenHash: { type: String, default: null },
    resetTokenExpiry: { type: Date, default: null },
    resetCodeHash: { type: String, default: null },
    resetCodeExpiry: { type: Date, default: null },
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
