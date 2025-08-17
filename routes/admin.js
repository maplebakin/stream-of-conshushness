// /routes/admin.js
import express from 'express';
import bcrypt from 'bcrypt'; // or 'bcryptjs' if you swapped
import User from '../models/User.js';
import auth from '../middleware/auth.js';

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
    console.error(e);
    res.status(500).json({ error: 'admin check failed' });
  }
}

/* ───────── one-time bootstrap: promote a user to admin (CLI/curl only) ───────── */
router.post('/grant', async (req, res) => {
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
    console.error(e);
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
    const crit = cursor ? { ...find, _id: { $gt: cursor } } : find;

    const docs = await User.find(crit)
      .select('_id username email isAdmin createdAt')
      .sort({ _id: 1 })
      .limit(Math.min(Number(limit) || 25, 100));

    const nextCursor = docs.length ? String(docs[docs.length - 1]._id) : null;
    res.json({ ok: true, users: docs, nextCursor });
  } catch (e) {
    console.error(e);
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

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    user.resetTokenHash = null;
    user.resetTokenExpiry = null;
    user.resetCodeHash = null;
    user.resetCodeExpiry = null;
    await user.save();

    res.json({ ok: true, user: { id: user._id, username: user.username } });
  } catch (e) {
    console.error(e);
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

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    user.resetTokenHash = null;
    user.resetTokenExpiry = null;
    user.resetCodeHash = null;
    user.resetCodeExpiry = null;
    await user.save();

    res.json({ ok: true, user: { id: user._id, username: user.username } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'admin username reset failed' });
  }
});


export default router;
