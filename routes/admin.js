// /routes/admin.js
import express from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import User from '../models/User.js';
import auth from '../middleware/auth.js';

const router = express.Router();

/* ───────────── Helpers ───────────── */
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

/* ───────────── Bootstrap: grant admin with secret (no auth) ─────────────
   POST /api/admin/grant { adminSecret, username }
   Only for first-run bootstrap. Remove or comment out after you have an admin.
*/
router.post('/grant', async (req, res) => {
  try {
    const { ADMIN_SECRET } = process.env;
    const { adminSecret, username } = req.body || {};
    if (!ADMIN_SECRET) return res.status(400).json({ error: 'ADMIN_SECRET not set' });
    if (adminSecret !== ADMIN_SECRET) return res.status(403).json({ error: 'invalid secret' });
    if (!username) return res.status(400).json({ error: 'username required' });

    const user = await User.findOneAndUpdate(
      { username },
      { $set: { isAdmin: true } },
      { new: true, projection: { username: 1, isAdmin: 1 } }
    );
    if (!user) return res.status(404).json({ error: 'user not found' });
    res.json({ ok: true, user });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'grant failed' });
  }
});

/* All routes below require login + admin */
router.use(auth, requireAdmin);

/* GET /api/admin/me -> confirm admin status */
router.get('/me', async (req, res) => {
  res.json({ user: { username: req.adminUser.username, isAdmin: true } });
});

/* GET /api/admin/users?q=alice&limit=20&cursor=<id>
   Simple pagination by ObjectId, case-insensitive username search. */
router.get('/users', async (req, res) => {
  try {
    const { q = '', limit = '20', cursor = '' } = req.query;
    const lim = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);

    const filter = {};
    if (q) filter.username = { $regex: new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') };
    if (cursor) filter._id = { $gt: cursor };

    const docs = await User.find(filter, { username: 1, isAdmin: 1 })
      .sort({ _id: 1 })
      .limit(lim + 1);

    const hasMore = docs.length > lim;
    const results = hasMore ? docs.slice(0, lim) : docs;
    const nextCursor = hasMore ? String(results[results.length - 1]._id) : null;

    res.json({ users: results, nextCursor });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'failed to list users' });
  }
});

/* PUT /api/admin/users/:id/password { newPassword }
   Hard reset a user’s password. */
router.put('/users/:id/password', async (req, res) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body || {};
    if (typeof newPassword !== 'string' || newPassword.length < 8) {
      return res.status(400).json({ error: 'password must be at least 8 characters' });
    }
    const user = await User.findById(id);
    if (!user) return res.status(404).json({ error: 'user not found' });

    user.passwordHash = await bcrypt.hash(newPassword, 12);

    // clear any reset artifacts if you use them
    user.resetTokenHash = null;
    user.resetTokenExpiry = null;
    user.resetCodeHash = null;
    user.resetCodeExpiry = null;

    await user.save();
    res.json({ ok: true, user: { id: user._id, username: user.username } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'admin reset failed' });
  }
});

/* POST /api/admin/reset-username { username, newPassword }
   Convenience endpoint if you only know the username. */
router.post('/reset-username', async (req, res) => {
  try {
    const { username, newPassword } = req.body || {};
    if (!username) return res.status(400).json({ error: 'username required' });
    if (typeof newPassword !== 'string' || newPassword.length < 8) {
      return res.status(400).json({ error: 'password must be at least 8 characters' });
    }

    const user = await User.findOne({ username });
    if (!user) return res.status(404).json({ error: 'user not found' });

    user.passwordHash = await bcrypt.hash(newPassword, 12);
    user.resetTokenHash = null;
    user.resetTokenExpiry = null;
    user.resetCodeHash = null;
    user.resetCodeExpiry = null;

    await user.save();
    res.json({ ok: true, user: { id: user._id, username: user.username } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'admin reset failed' });
  }
});

export default router;
