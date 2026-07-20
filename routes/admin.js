// /routes/admin.js
import express from 'express';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import User from '../models/User.js';
import auth from '../middleware/auth.js';
import { passwordResetLimiter as adminGrantLimiter } from '../middleware/rateLimiter.js';
import { logSafeError } from '../utils/errorHandler.js';

const { ObjectId } = mongoose.Types;
const BCRYPT_ROUNDS = 12;

function incrementAuthVersion(user) {
  const numeric = Number(user.authVersion ?? 0);
  const current = Number.isSafeInteger(numeric) && numeric >= 0 ? numeric : 0;
  user.authVersion = current + 1;
}

const router = express.Router();

/* ───────── require logged-in admin ───────── */
async function requireAdmin(req, res, next) {
  try {
    if (!req.user?.userId) return res.status(401).json({ error: 'not authorized' });
    const me = await User.findById(req.user.userId).select('isAdmin username');
    if (!me || !me.isAdmin) return res.status(403).json({ error: 'forbidden' });
    req.adminUser = me;
    next();
  } catch (e) {
    logSafeError('admin permission check failed', e);
    res.status(500).json({ error: 'admin check failed' });
  }
}

/* ───────── restrict grant to admins unless bootstrapping ───────── */
async function requireGrantPermissions(req, res, next) {
  try {
    const bootstrapEnabled = process.env.ADMIN_GRANT_BOOTSTRAP === 'true';
    const adminExists = await User.exists({ isAdmin: true });

    if (!bootstrapEnabled || adminExists) {
      return requireAdmin(req, res, next);
    }

    return next();
  } catch (e) {
    logSafeError('admin grant permission check failed', e);
    res.status(500).json({ error: 'admin check failed' });
  }
}

/* ───────── one-time bootstrap: promote a user to admin (CLI/curl only) ───────── */
router.post('/grant', auth, adminGrantLimiter, requireGrantPermissions, async (req, res) => {
  try {
    const { ADMIN_SECRET } = process.env;
    const { adminSecret, username } = req.body || {};
    if (!ADMIN_SECRET || adminSecret !== ADMIN_SECRET) {
      return res.status(403).json({ error: 'forbidden' });
    }
    const user = await User.findOne({ username });
    if (!user) return res.status(404).json({ error: 'user not found' });
    user.isAdmin = true;
    await user.save();
    res.json({ ok: true, user: { id: user._id, username: user.username, isAdmin: user.isAdmin } });
  } catch (e) {
    logSafeError('admin grant failed', e);
    res.status(500).json({ error: 'grant failed' });
  }
});

/* ───────── sanity: am I an admin? ───────── */
router.get('/me', auth, requireAdmin, (_req, res) => {
  res.json({ ok: true, user: { isAdmin: true } });
});

/* ───────── list users (paged + optional search) ───────── */
router.get('/users', auth, requireAdmin, async (req, res) => {
  try {
    const { q = '', limit = 25, cursor = '' } = req.query;
    const find = q
      ? { username: new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }
      : {};
    const validCursor = cursor && ObjectId.isValid(cursor);
    const crit = validCursor ? { ...find, _id: { $gt: new ObjectId(cursor) } } : find;

    const docs = await User.find(crit)
      .select('_id username email isAdmin createdAt')
      .sort({ _id: 1 })
      .limit(Math.min(Number(limit) || 25, 100));

    const nextCursor = docs.length ? String(docs[docs.length - 1]._id) : null;
    res.json({ ok: true, users: docs, nextCursor });
  } catch (e) {
    logSafeError('admin user list failed', e);
    res.status(500).json({ error: 'list users failed' });
  }
});

/* ───────── reset by USER ID (matches your PUT /users/:id/password) ───────── */
router.put('/users/:id/password', auth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body || {};
    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ error: 'newPassword must be at least 8 chars' });
    }
    const user = await User.findById(id);
    if (!user) return res.status(404).json({ error: 'user not found' });

    user.passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    incrementAuthVersion(user);
    user.resetTokenHash = null;
    user.resetTokenExpiry = null;
    user.resetCodeHash = null;
    user.resetCodeExpiry = null;
    await user.save();

    res.json({ ok: true, user: { id: user._id, username: user.username } });
  } catch (e) {
    logSafeError('admin password reset by id failed', e);
    res.status(500).json({ error: 'admin id reset failed' });
  }
});

/* ───────── quick reset by USERNAME (matches your POST /reset-username) ───────── */
// routes/admin.js
router.post('/reset-username', auth, requireAdmin, async (req, res) => {
  try {
    const { username, newPassword } = req.body || {};
    if (!username || !newPassword || newPassword.length < 8) {
      return res.status(400).json({ error: 'username and newPassword (>=8) required' });
    }
    const user = await User.findOne({ username });
    if (!user) return res.status(404).json({ error: 'user not found' });

    user.passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    incrementAuthVersion(user);
    user.resetTokenHash = null;
    user.resetTokenExpiry = null;
    user.resetCodeHash = null;
    user.resetCodeExpiry = null;
    await user.save();

    res.json({ ok: true, user: { id: user._id, username: user.username } });
  } catch (e) {
    logSafeError('admin password reset by username failed', e);
    res.status(500).json({ error: 'admin username reset failed' });
  }
});


export default router;
