// /routes/auth.js
// Unified auth router for Stream of Conshushness
// Flows: register, login (username OR email), forgot (link+code), reset, change-password, admin reset, email verify, profile

import 'dotenv/config';
import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
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
const ok = (res, payload = {}) => res.json({ ok: true, ...payload });
const fail = (res, code, message) => res.status(code).json({ error: message });
const escapeRegex = (s = '') => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function isEmail(s = '') {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);
}

async function generateUniqueUsername(base) {
  // normalize: a-z0-9._- only, trim dots/dashes
  let stem = (base || 'user')
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '')
    .replace(/^[-_.]+|[-_.]+$/g, '') || 'user';

  let candidate = stem;
  let n = 0;
  // try stem, stem1, stem2, ...
  while (await User.findOne({ username: candidate })) {
    n += 1;
    candidate = `${stem}${n}`;
    if (n > 200) {
      candidate = `user${crypto.randomBytes(3).toString('hex')}`;
      if (!(await User.findOne({ username: candidate }))) break;
    }
  }
  return candidate;
}

/* ─────────────────────────── ROUTES ─────────────────────────── */

/** REGISTER (tolerant)
 * POST /api/register  or  /api/auth/register
 * Accepts any of:
 *   { username, password, email? }
 *   { email, password }                    // auto-generates username from email local-part
 *   { identifier, password }               // identifier can be username or email
 */
router.post('/register', async (req, res) => {
  try {
    const {
      username: rawUsername,
      email: rawEmail,
      identifier,
      password,
    } = req.body || {};

    const loginId = (identifier || rawUsername || rawEmail || '').trim();
    const email = rawEmail?.trim() || (isEmail(loginId) ? loginId : '');

    if (!password || password.length < 6) {
      return fail(res, 400, 'password must be at least 6 chars');
    }

    let username = (rawUsername || (!isEmail(loginId) ? loginId : '') || '').trim();

    // If username missing but we have an email, mint a stable unique username from local-part.
    if (!username && email) {
      const local = email.split('@')[0];
      username = await generateUniqueUsername(local);
    }

    if (!username) return fail(res, 400, 'username or email required');

    // Uniqueness checks
    const nameTaken = await User.findOne({ username });
    if (nameTaken) return fail(res, 409, 'username already taken');

    if (email) {
      const emailClash = await User.findOne({
        email: { $regex: new RegExp(`^${escapeRegex(email)}$`, 'i') },
      });
      if (emailClash) return fail(res, 409, 'email already in use');
    }

    const user = new User({ username, email: email || '' });
    user.passwordHash = await bcrypt.hash(password, 10);
    await user.save();

    const token = makeJWT(user);
    return ok(res, {
      token,
      user: { id: user._id, username: user.username, email: user.email },
    });
  } catch (e) {
    console.error(e);
    return fail(res, 500, 'register failed');
  }
});

/** LOGIN (username OR email)
 * POST /api/login  or  /api/auth/login
 * Bodies supported:
 *   { username, password }
 *   { email, password }
 *   { identifier, password }
 */
router.post('/login', async (req, res) => {
  try {
    const { username, email, identifier, password } = req.body || {};
    const loginId = (identifier || username || email || '').trim();
    if (!loginId || !password) return fail(res, 400, 'missing credentials');

    const byEmail = isEmail(loginId);
    const query = byEmail
      ? { email: { $regex: new RegExp(`^${escapeRegex(loginId)}$`, 'i') } }
      : { username: loginId };

    const user = await User.findOne(query);
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
 * POST /api/forgot  or  /api/auth/forgot   { identifier }
 */
router.post('/forgot', async (req, res) => {
  try {
    const { identifier } = req.body || {};
    if (!identifier) return fail(res, 400, 'identifier required');

    const user = await User.findOne({
      $or: [
        { username: identifier },
        { email: new RegExp(`^${escapeRegex(identifier)}$`, 'i') },
      ],
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
 * POST /api/reset  or  /api/auth/reset
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
 * POST /api/change-password  or  /api/auth/change-password
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
 * POST /api/admin/reset-password  or  /api/auth/admin/reset-password
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

/* ───────────────── Email: add & verify (logged-in) ───────────────── */

// GET /api/me
router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId)
      .select('_id username email isAdmin createdAt updatedAt');
    if (!user) return res.status(404).json({ error: 'user not found' });
    res.json({ ok: true, user });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'me failed' });
  }
});

// PATCH /api/me   { email?, username? }
router.patch('/me', auth, async (req, res) => {
  try {
    const { email, username } = req.body || {};
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ error: 'user not found' });

    if (typeof email === 'string' && email.trim()) {
      const clash = await User.findOne({
        _id: { $ne: user._id },
        email: { $regex: new RegExp(`^${escapeRegex(email.trim())}$`, 'i') },
      });
      if (clash) return res.status(409).json({ error: 'email already in use' });
      user.email = email.trim();
    }

    if (typeof username === 'string' && username.trim() && username.trim() !== user.username) {
      const exists = await User.findOne({ username: username.trim() });
      if (exists) return res.status(409).json({ error: 'username already taken' });
      user.username = username.trim();
    }

    await user.save();
    res.json({
      ok: true,
      user: { id: user._id, username: user.username, email: user.email, isAdmin: user.isAdmin },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'update profile failed' });
  }
});

/** START EMAIL VERIFY
 * POST /api/email/start-verify  { email }
 */
router.post('/email/start-verify', auth, async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email || !isEmail(email)) return fail(res, 400, 'valid email required');

    const user = await User.findById(req.user.userId);
    if (!user) return fail(res, 401, 'not authorized');

    const clash = await User.findOne({
      _id: { $ne: user._id },
      email: { $regex: new RegExp(`^${escapeRegex(email)}$`, 'i') },
    });
    if (clash) return fail(res, 409, 'email already in use');

    const rawCode = String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0');
    const codeHash = await bcrypt.hash(rawCode, 10);

    user.pendingEmail = email;
    user.emailVerifyCodeHash = codeHash;
    user.emailVerifyCodeExpiry = nowPlus(30);
    await user.save();

    if (transporter) {
      try {
        await transporter.sendMail({
          from: SMTP_FROM || 'no-reply@stream.app',
          to: email,
          subject: 'Verify your email',
          text: `Your verification code is: ${rawCode}\n\nThis code expires in 30 minutes.`,
          html: `<p>Your verification code is:</p><p style="font-size:20px"><b>${rawCode}</b></p><p>This code expires in 30 minutes.</p>`,
        });
      } catch (mailErr) {
        console.error('[auth] email send failed:', mailErr?.message || mailErr);
      }
    } else {
      devLog(`Email verify requested for @${user.username} → ${email}`);
      devLog(`  Code: ${rawCode} (valid 30m)`);
    }

    const payload = {};
    if (!isProd) payload.dev = { code: rawCode, email };
    return ok(res, payload);
  } catch (e) {
    console.error(e);
    return fail(res, 500, 'email start-verify failed');
  }
});

/** CONFIRM EMAIL VERIFY
 * POST /api/email/verify  { code }
 */
router.post('/email/verify', auth, async (req, res) => {
  try {
    const { code } = req.body || {};
    if (!code) return fail(res, 400, 'code required');

    const user = await User.findById(req.user.userId);
    if (!user) return fail(res, 401, 'not authorized');
    if (!user.pendingEmail || !user.emailVerifyCodeHash || !user.emailVerifyCodeExpiry)
      return fail(res, 400, 'no pending verification');

    if (new Date() > new Date(user.emailVerifyCodeExpiry))
      return fail(res, 400, 'code expired');

    const okCode = await bcrypt.compare(String(code), user.emailVerifyCodeHash || '');
    if (!okCode) return fail(res, 400, 'invalid code');

    user.email = user.pendingEmail;
    user.emailVerifiedAt = new Date();
    user.pendingEmail = '';
    user.emailVerifyCodeHash = null;
    user.emailVerifyCodeExpiry = null;
    await user.save();

    return ok(res, {
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        emailVerified: !!user.emailVerifiedAt,
      },
    });
  } catch (e) {
    console.error(e);
    return fail(res, 500, 'email verify failed');
  }
});

export default router;
