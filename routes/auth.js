// /routes/auth.js
// Unified auth router for StreamofConshushness
// Flows: register, login (username OR email), forgot (link+code), reset, change-password, admin reset, email verify, profile

import 'dotenv/config';
import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import User from '../models/User.js';
import Upload from '../models/Upload.js';
import auth from '../middleware/auth.js';
import { authLimiter, passwordResetLimiter } from '../middleware/rateLimiter.js';
import { logSafeError } from '../utils/errorHandler.js';
import { retireOwnedUpload } from '../utils/upload.js';
import { fileIdFromPrivateUploadUrl, privateUploadUrl } from '../utils/privateUploadStorage.js';

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
    {
      id: user._id,
      userId: user._id,
      username: user.username,
      authVersion: normalizedAuthVersion(user.authVersion),
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}
const nowPlus = (mins) => new Date(Date.now() + mins * 60 * 1000);
const ok = (res, payload = {}) => res.json({ ok: true, ...payload });
const fail = (res, code, message) => res.status(code).json({ error: message });
const escapeRegex = (s = '') => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function normalizeEmail(value = '') {
  return String(value).trim().toLowerCase();
}

function emailIdentityQuery(value, excludeUserId = null) {
  const email = normalizeEmail(value);
  const query = {
    $or: [
      { emailNormalized: email },
      { email: { $regex: new RegExp(`^${escapeRegex(email)}$`, 'i') } },
    ],
  };
  if (excludeUserId) query._id = { $ne: excludeUserId };
  return query;
}

function duplicateKeyFields(error) {
  if (Number(error?.code) !== 11000) return [];
  return [...new Set([
    ...Object.keys(error?.keyPattern || {}),
    ...Object.keys(error?.keyValue || {}),
  ])];
}

function normalizedAuthVersion(value) {
  const numeric = Number(value ?? 0);
  return Number.isSafeInteger(numeric) && numeric >= 0 ? numeric : 0;
}

function incrementAuthVersion(user) {
  user.authVersion = normalizedAuthVersion(user.authVersion) + 1;
}

function shouldExposeAuthTestCredentials() {
  return (
    process.env.NODE_ENV !== 'production' &&
    process.env.EXPOSE_AUTH_TEST_CREDENTIALS === 'true'
  );
}

function serializeUser(user) {
  if (!user) return null;
  return {
    id: user._id,
    username: user.username,
    email: user.email,
    pendingEmail: user.pendingEmail,
    isAdmin: user.isAdmin,
    profilePicture: user.profilePicture,
    emailVerified: !!user.emailVerifiedAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

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
router.post('/register', authLimiter, async (req, res) => {
  try {
    const {
      username: rawUsername,
      email: rawEmail,
      identifier,
      password,
    } = req.body || {};

    const loginId = (identifier || rawUsername || rawEmail || '').trim();
    const email = normalizeEmail(rawEmail || (isEmail(loginId) ? loginId : ''));

    if (email && !isEmail(email)) return fail(res, 400, 'valid email required');

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
      const emailClash = await User.findOne(emailIdentityQuery(email));
      if (emailClash) return fail(res, 409, 'email already in use');
    }

    const user = new User({
      username,
      email: email || '',
      emailNormalized: email || null,
    });
    user.passwordHash = await bcrypt.hash(password, 10);
    await user.save();

    const token = makeJWT(user);
    return ok(res, {
      token,
      user: { id: user._id, username: user.username, email: user.email },
    });
  } catch (e) {
    const duplicateFields = duplicateKeyFields(e);
    if (duplicateFields.includes('emailNormalized') || duplicateFields.includes('email')) {
      return fail(res, 409, 'email already in use');
    }
    if (duplicateFields.includes('username')) {
      return fail(res, 409, 'username already taken');
    }
    if (Number(e?.code) === 11000) return fail(res, 409, 'account already exists');
    logSafeError('auth register failed', e);
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
router.post('/login', authLimiter, async (req, res) => {
  try {
    const { username, email, identifier, password } = req.body || {};
    const loginId = (identifier || username || email || '').trim();
    if (!loginId || !password) return fail(res, 400, 'missing credentials');

    const byEmail = isEmail(loginId);
    const query = byEmail
      ? emailIdentityQuery(loginId)
      : { username: loginId };

    const user = await User.findOne(query);
    if (!user) return fail(res, 401, 'invalid credentials');

    const okPass = await bcrypt.compare(password, user.passwordHash);
    if (!okPass) return fail(res, 401, 'invalid credentials');

    const token = makeJWT(user);
    return ok(res, { token, user: { id: user._id, username: user.username, email: user.email } });
  } catch (e) {
    logSafeError('auth login failed', e);
    return fail(res, 500, 'login failed');
  }
});

/** FORGOT (no enumeration)
 * POST /api/forgot  or  /api/auth/forgot   { identifier }
 */
router.post('/forgot', passwordResetLimiter, async (req, res) => {
  try {
    const { identifier } = req.body || {};
    const loginId = String(identifier || '').trim();
    if (!loginId) return fail(res, 400, 'identifier required');

    const identityClauses = [{ username: loginId }];
    if (isEmail(loginId)) {
      const normalizedEmail = normalizeEmail(loginId);
      identityClauses.push(
        { emailNormalized: normalizedEmail },
        { email: new RegExp(`^${escapeRegex(normalizedEmail)}$`, 'i') }
      );
    }
    const user = await User.findOne({
      $or: identityClauses,
    });

    // Always 200 to avoid enumeration.
    if (!user) {
      return ok(res);
    }

    // Create long token + 6-digit code
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    const rawCode = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
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
        logSafeError('auth password reset email failed', mailErr);
      }
    } else {
    }

    const payload = {};
    if (shouldExposeAuthTestCredentials()) {
      payload.dev = { username: user.username, resetLink, resetCode: rawCode };
    }

    return ok(res, payload);
  } catch (e) {
    logSafeError('auth forgot password failed', e);
    return fail(res, 500, 'forgot failed');
  }
});

/** RESET (two paths)
 * POST /api/reset  or  /api/auth/reset
 *   A) { token, newPassword }
 *   B) { username, code, newPassword }
 */
router.post('/reset', passwordResetLimiter, async (req, res) => {
  try {
    const { token, username, code, newPassword } = req.body || {};
    if (!newPassword || newPassword.length < 6) {
      return fail(res, 400, 'newPassword must be at least 6 chars');
    }

    let user = null;
    const now = new Date();
    const passwordHash = await bcrypt.hash(newPassword, 10);
    const passwordUpdate = {
      $set: {
        passwordHash,
        resetTokenHash: null,
        resetTokenExpiry: null,
        resetCodeHash: null,
        resetCodeExpiry: null,
      },
      $inc: { authVersion: 1 },
    };

    if (token) {
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      user = await User.findOneAndUpdate(
        {
          resetTokenHash: tokenHash,
          resetTokenExpiry: { $gt: now },
        },
        passwordUpdate,
        { new: true, runValidators: true }
      );
      if (!user) return fail(res, 400, 'invalid or expired token');
    } else {
      if (!username || !code) return fail(res, 400, 'username and code required');
      const candidate = await User.findOne({ username });
      if (!candidate || !candidate.resetCodeHash || !candidate.resetCodeExpiry || candidate.resetCodeExpiry < now) {
        return fail(res, 400, 'invalid or expired code');
      }
      const okCode = await bcrypt.compare(code, candidate.resetCodeHash);
      if (!okCode) return fail(res, 400, 'invalid or expired code');
      user = await User.findOneAndUpdate(
        {
          _id: candidate._id,
          resetCodeHash: candidate.resetCodeHash,
          resetCodeExpiry: { $gt: now },
        },
        passwordUpdate,
        { new: true, runValidators: true }
      );
      if (!user) return fail(res, 400, 'invalid or expired code');
    }

    const jwtToken = makeJWT(user);
    return ok(res, { token: jwtToken, user: { id: user._id, username: user.username, email: user.email } });
  } catch (e) {
    logSafeError('auth reset password failed', e);
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
    incrementAuthVersion(user);
    await user.save();
    return ok(res, { token: makeJWT(user) });
  } catch (e) {
    logSafeError('auth change password failed', e);
    return fail(res, 500, 'change-password failed');
  }
});

/** ADMIN RESET (hardened)
 * POST /api/admin/reset-password  or  /api/auth/admin/reset-password
 * Default: requires authenticated admin user.
 * Optional legacy shared-secret path can be enabled in non-production with ALLOW_SHARED_ADMIN_RESET=true.
 */
router.post('/admin/reset-password', auth, passwordResetLimiter, async (req, res) => {
  try {
    const { adminSecret, username, newPassword } = req.body || {};
    if (!username || !newPassword || newPassword.length < 8) {
      return fail(res, 400, 'username and newPassword (>=8) required');
    }

    const requester = await User.findById(req.user.userId).select('_id username isAdmin');
    const legacyAllowed = NODE_ENV !== 'production' && process.env.ALLOW_SHARED_ADMIN_RESET === 'true';
    const secretOk = legacyAllowed && !!ADMIN_SECRET && adminSecret === ADMIN_SECRET;
    const adminOk = !!requester?.isAdmin;

    if (!adminOk && !secretOk) return fail(res, 403, 'forbidden');

    const user = await User.findOne({ username });
    if (!user) return fail(res, 404, 'user not found');

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    incrementAuthVersion(user);
    user.resetTokenHash = null;
    user.resetTokenExpiry = null;
    user.resetCodeHash = null;
    user.resetCodeExpiry = null;
    await user.save();

    const actor = requester?.username || 'unknown';
    console.warn('[audit] admin reset password: actor=' + actor + ' target=' + user.username + ' mode=' + (adminOk ? 'admin' : 'shared-secret'));

    return ok(res, { user: { id: user._id, username: user.username } });
  } catch (e) {
    logSafeError('auth admin reset password failed', e);
    return fail(res, 500, 'admin reset failed');
  }
});

/* ───────────────── Email: add & verify (logged-in) ───────────────── */

// GET /api/me
router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select(
      '_id username email pendingEmail isAdmin profilePicture emailVerifiedAt createdAt updatedAt'
    );
    if (!user) return res.status(404).json({ error: 'user not found' });
    res.json({ ok: true, user: serializeUser(user) });
  } catch (e) {
    logSafeError('auth profile lookup failed', e);
    res.status(500).json({ error: 'me failed' });
  }
});

// PATCH /api/me   { email?, username? }
router.patch('/me', auth, async (req, res) => {
  try {
    const { email, username, profilePicture } = req.body || {};
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ error: 'user not found' });

    if (typeof email === 'string' && normalizeEmail(email) !== normalizeEmail(user.email)) {
      return res.status(400).json({
        error: 'Email changes require verification. Use /api/email/start-verify.',
      });
    }

    if (typeof username === 'string' && username.trim() && username.trim() !== user.username) {
      const exists = await User.findOne({ username: username.trim() });
      if (exists) return res.status(409).json({ error: 'username already taken' });
      user.username = username.trim();
    }

    let previousProfilePictureId = null;
    if (typeof profilePicture === 'string') {
      previousProfilePictureId = fileIdFromPrivateUploadUrl(user.profilePicture);
      const nextProfilePictureId = fileIdFromPrivateUploadUrl(profilePicture);
      if (profilePicture.trim() && !nextProfilePictureId) {
        return res.status(400).json({ error: 'profilePicture must be a private upload URL' });
      }

      if (nextProfilePictureId) {
        const nextUpload = await Upload.findOne({
          fileId: nextProfilePictureId,
          ownerId: user._id,
          deletedAt: null,
        });
        if (!nextUpload || !String(nextUpload.mimeType || '').startsWith('image/')) {
          return res.status(400).json({ error: 'profilePicture must reference one of your image uploads' });
        }
        nextUpload.resourceType = 'profile-picture';
        nextUpload.resourceId = user._id;
        await nextUpload.save();
        user.profilePicture = privateUploadUrl(nextProfilePictureId);
      } else {
        user.profilePicture = '';
      }
    }

    await user.save();
    if (previousProfilePictureId && previousProfilePictureId !== fileIdFromPrivateUploadUrl(user.profilePicture)) {
      try {
        await retireOwnedUpload(previousProfilePictureId, user._id);
      } catch (cleanupError) {
        logSafeError('auth profile picture replacement cleanup failed', cleanupError);
      }
    }
    res.json({
      ok: true,
      user: serializeUser(user),
    });
  } catch (e) {
    logSafeError('auth profile update failed', e);
    res.status(500).json({ error: 'update profile failed' });
  }
});

/** START EMAIL VERIFY
 * POST /api/email/start-verify  { email }
 */
router.post('/email/start-verify', auth, async (req, res) => {
  try {
    const { email } = req.body || {};
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail || !isEmail(normalizedEmail)) return fail(res, 400, 'valid email required');

    const user = await User.findById(req.user.userId);
    if (!user) return fail(res, 401, 'not authorized');

    const clash = await User.findOne(emailIdentityQuery(normalizedEmail, user._id));
    if (clash) return fail(res, 409, 'email already in use');

    const rawCode = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
    const codeHash = await bcrypt.hash(rawCode, 10);

    user.pendingEmail = normalizedEmail;
    user.emailVerifyCodeHash = codeHash;
    user.emailVerifyCodeExpiry = nowPlus(30);
    await user.save();

    if (transporter) {
      try {
        await transporter.sendMail({
          from: SMTP_FROM || 'no-reply@stream.app',
          to: normalizedEmail,
          subject: 'Verify your email',
          text: `Your verification code is: ${rawCode}\n\nThis code expires in 30 minutes.`,
          html: `<p>Your verification code is:</p><p style="font-size:20px"><b>${rawCode}</b></p><p>This code expires in 30 minutes.</p>`,
        });
      } catch (mailErr) {
        logSafeError('auth verification email failed', mailErr);
      }
    } else {
    }

    const payload = {};
    if (shouldExposeAuthTestCredentials()) payload.dev = { code: rawCode, email: normalizedEmail };
    return ok(res, payload);
  } catch (e) {
    logSafeError('auth email verification start failed', e);
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

    const verifiedEmail = normalizeEmail(user.pendingEmail);
    if (!isEmail(verifiedEmail)) return fail(res, 400, 'pending email is invalid');

    // Recheck at confirmation time so a legacy email record cannot be claimed after
    // the code was issued. The unique normalized key closes the concurrent race.
    const clash = await User.findOne(emailIdentityQuery(verifiedEmail, user._id));
    if (clash) return fail(res, 409, 'email already in use');

    user.email = verifiedEmail;
    user.emailNormalized = verifiedEmail;
    user.emailVerifiedAt = new Date();
    user.pendingEmail = '';
    user.emailVerifyCodeHash = null;
    user.emailVerifyCodeExpiry = null;
    await user.save();

    return ok(res, { user: serializeUser(user) });
  } catch (e) {
    if (Number(e?.code) === 11000) return fail(res, 409, 'email already in use');
    logSafeError('auth email verification failed', e);
    return fail(res, 500, 'email verify failed');
  }
});

export default router;
