// /routes/auth.js
// Unified auth router for Stream of Conshushness
// Flows: register, login, forgot (link+code), reset, change-password (authed), admin reset
import 'dotenv/config'; 
import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';          // or: import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import User from '../models/User.js';
import auth from '../middleware/auth.js';

const router = express.Router();

/* ─────────────────────────── Env & Transport ─────────────────────────── */
const {
  JWT_SECRET,
  NODE_ENV,
  APP_BASE_URL,
  SMTP_HOST,
  SMTP_PORT,
  SMTP_USER,
  SMTP_PASS,
  SMTP_FROM,
  ADMIN_SECRET,
} = process.env;

if (!JWT_SECRET) {
  console.warn('[auth] JWT_SECRET is missing. Set it in .env.');
}

const transporter =
  SMTP_HOST && SMTP_USER && SMTP_PASS
    ? nodemailer.createTransport({
        host: SMTP_HOST,
        port: Number(SMTP_PORT || 587),
        secure: false,
        auth: { user: SMTP_USER, pass: SMTP_PASS },
      })
    : null;

/* ─────────────────────────── Helpers ─────────────────────────── */
function makeJWT(user) {
  return jwt.sign(
    { id: user._id, userId: user._id, username: user.username },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}
const nowPlus = (mins) => new Date(Date.now() + mins * 60 * 1000);
const isProd = NODE_ENV === 'production';
const devLog = (...args) => (!isProd ? console.log('[DEV]', ...args) : null);

// Standard response helpers
const ok = (res, payload = {}) => res.json({ ok: true, ...payload });
const fail = (res, code, message) => res.status(code).json({ error: message });

/* ─────────────────────────── ROUTES ─────────────────────────── */

/** REGISTER
 * POST /api/auth/register  { username, password, email? }
 */
router.post('/register', async (req, res) => {
  try {
    const { username, password, email = '' } = req.body || {};
    if (!username || !password) return fail(res, 400, 'username and password required');

    const exists = await User.findOne({ username });
    if (exists) return fail(res, 409, 'username already taken');

    const user = new User({ username, email });
    user.passwordHash = await bcrypt.hash(password, 10);
    await user.save();

    const token = makeJWT(user);
    return ok(res, { token, user: { id: user._id, username: user.username, email: user.email } });
  } catch (e) {
    console.error(e);
    return fail(res, 500, 'register failed');
  }
});

/** LOGIN
 * POST /api/auth/login  { username, password }
 */
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return fail(res, 400, 'missing credentials');

    const user = await User.findOne({ username });
    if (!user) return fail(res, 401, 'invalid credentials');

    const okPass = await bcrypt.compare(password, user.passwordHash);
    if (!okPass) return fail(res, 401, 'invalid credentials');

    const token = makeJWT(user);
    return ok(res, { token, user: { id: user._id, username: user.username, email: user.email } });
  } catch (e) {
    console.error(e);
    return fail(res, 500, 'login failed');
  }
});

/** FORGOT (no enumeration)
 * POST /api/auth/forgot  { identifier }   // username or email (case-insensitive)
 * - Issues both:
 *   1) token link → /reset?token=...
 *   2) 6-digit code → manual path (works w/out email)
 */
router.post('/forgot', async (req, res) => {
  try {
    const { identifier } = req.body || {};
    if (!identifier) return fail(res, 400, 'identifier required');

    const user = await User.findOne({
      $or: [{ username: identifier }, { email: new RegExp(`^${identifier}$`, 'i') }],
    });

    // Always 200 to avoid enumeration.
    if (!user) {
      devLog('Forgot requested for non-existent identifier:', identifier);
      return ok(res);
    }

    // Create long token + 6-digit code
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    const rawCode = String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0');
    const codeHash = await bcrypt.hash(rawCode, 10);

    user.resetTokenHash = tokenHash;
    user.resetTokenExpiry = nowPlus(30);
    user.resetCodeHash = codeHash;
    user.resetCodeExpiry = nowPlus(30);
    await user.save();

    const resetLink = `${(APP_BASE_URL || '').replace(/\/$/, '')}/reset?token=${encodeURIComponent(rawToken)}`;

    if (transporter && user.email) {
      try {
        await transporter.sendMail({
          from: SMTP_FROM || 'no-reply@stream.app',
          to: user.email,
          subject: 'Reset your password',
          text: `Reset link:\n${resetLink}\n\nOr use this code: ${rawCode} (valid 30 minutes).`,
          html: `<p>Reset link:</p><p><a href="${resetLink}">${resetLink}</a></p><p>Or use this code: <b>${rawCode}</b> (valid 30 minutes).</p>`,
        });
      } catch (mailErr) {
        console.error('[auth] email send failed:', mailErr?.message || mailErr);
      }
    } else {
      devLog(`Password reset for @${user.username}`);
      devLog(`  Link: ${resetLink}`);
      devLog(`  Code: ${rawCode} (valid 30m)`);
    }

    const payload = {};
    if (!isProd) payload.dev = { username: user.username, resetLink, resetCode: rawCode };

    return ok(res, payload);
  } catch (e) {
    console.error(e);
    return fail(res, 500, 'forgot failed');
  }
});

/** RESET (two paths)
 * POST /api/auth/reset
 *   A) { token, newPassword }
 *   B) { username, code, newPassword }
 */
router.post('/reset', async (req, res) => {
  try {
    const { token, username, code, newPassword } = req.body || {};
    if (!newPassword || newPassword.length < 6) {
      return fail(res, 400, 'newPassword must be at least 6 chars');
    }

    let user = null;

    if (token) {
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      user = await User.findOne({
        resetTokenHash: tokenHash,
        resetTokenExpiry: { $gt: new Date() },
      });
      if (!user) return fail(res, 400, 'invalid or expired token');
    } else {
      if (!username || !code) return fail(res, 400, 'username and code required');
      user = await User.findOne({ username });
      if (!user || !user.resetCodeHash || !user.resetCodeExpiry || user.resetCodeExpiry < new Date()) {
        return fail(res, 400, 'invalid or expired code');
      }
      const okCode = await bcrypt.compare(code, user.resetCodeHash);
      if (!okCode) return fail(res, 400, 'invalid or expired code');
    }

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    user.resetTokenHash = null;
    user.resetTokenExpiry = null;
    user.resetCodeHash = null;
    user.resetCodeExpiry = null;
    await user.save();

    const jwtToken = makeJWT(user);
    return ok(res, { token: jwtToken, user: { id: user._id, username: user.username, email: user.email } });
  } catch (e) {
    console.error(e);
    return fail(res, 500, 'reset failed');
  }
});

/** CHANGE PASSWORD (logged-in)
 * POST /api/auth/change-password  { oldPassword, newPassword }
 * Header: Authorization: Bearer <jwt>
 */
router.post('/change-password', auth, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body || {};
    if (!newPassword || newPassword.length < 6) {
      return fail(res, 400, 'newPassword must be at least 6 chars');
    }

    const user = await User.findById(req.user.userId);
    if (!user) return fail(res, 401, 'not authorized');

    const okOld = await bcrypt.compare(oldPassword || '', user.passwordHash);
    if (!okOld) return fail(res, 400, 'old password is incorrect');

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    await user.save();
    return ok(res);
  } catch (e) {
    console.error(e);
    return fail(res, 500, 'change-password failed');
  }
});

/** ADMIN RESET (manual override)
 * POST /api/auth/admin/reset-password  { adminSecret, username, newPassword }
 * - Use via CLI/curl only (do not call from frontend)
 */
router.post('/admin/reset-password', async (req, res) => {
  try {
    const { adminSecret, username, newPassword } = req.body || {};
    if (adminSecret !== ADMIN_SECRET || !ADMIN_SECRET) return fail(res, 403, 'forbidden');
    if (!username || !newPassword || newPassword.length < 6) {
      return fail(res, 400, 'username and newPassword (>=6) required');
    }

    const user = await User.findOne({ username });
    if (!user) return fail(res, 404, 'user not found');

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    user.resetTokenHash = null;
    user.resetTokenExpiry = null;
    user.resetCodeHash = null;
    user.resetCodeExpiry = null;
    await user.save();

    return ok(res, { user: { id: user._id, username: user.username } });
  } catch (e) {
    console.error(e);
    return fail(res, 500, 'admin reset failed');
  }
});

export default router;
