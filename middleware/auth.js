// middleware/auth.js — public-path allowlist + resilient claims
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { logSafeError } from '../utils/errorHandler.js';

const PUBLIC_PATHS = [
  '/health',
  '/health/live',
];
function isPublic(req) {
  // Allow all auth endpoints: /api/auth, /api/auth/login, /api/auth/register, etc.
  if (/^\/api\/auth(\/|$)/.test(req.path)) return true;
  // Allow health + any static/public assets if you serve them
  if (PUBLIC_PATHS.includes(req.path)) return true;
  if (req.path.startsWith('/public/')) return true;
  return false;
}

function normalizedAuthVersion(value) {
  if (value === undefined || value === null) return 0;
  const numeric = Number(value);
  return Number.isSafeInteger(numeric) && numeric >= 0 ? numeric : null;
}

export default async function auth(req, res, next) {
  if (isPublic(req)) return next();

  const hdr = req.headers.authorization || '';
  const token = hdr.replace(/^Bearer\s+/i, '').trim();
  if (!token) return res.status(401).json({ error: 'missing token' });

  const secret = process.env.JWT_SECRET;
  if (!secret || String(secret).length < 12) {
    console.error('[auth] JWT_SECRET is missing or too short');
    return res.status(500).json({ error: 'Internal server error' });
  }

  let payload;
  try {
    payload = jwt.verify(token, secret);
  } catch {
    return res.status(401).json({ error: 'invalid token' });
  }

  const userId = payload.userId || payload.id || payload._id || payload.sub;
  const tokenAuthVersion = normalizedAuthVersion(payload.authVersion);
  if (!userId || tokenAuthVersion === null) {
    return res.status(401).json({ error: 'invalid token' });
  }

  try {
    const user = await User.findById(userId).select('_id authVersion');
    if (!user) return res.status(401).json({ error: 'invalid token' });

    const currentAuthVersion = normalizedAuthVersion(user.authVersion);
    if (currentAuthVersion === null || tokenAuthVersion !== currentAuthVersion) {
      return res.status(401).json({ error: 'invalid token' });
    }

    // Be generous in which identity claim we accept, but expose one canonical shape.
    req.user = {
      ...(req.user || {}),
      ...payload,
      userId,
      authVersion: currentAuthVersion,
    };
    return next();
  } catch (err) {
    // A malformed identity claim is an invalid token. Database availability failures
    // are operational failures and must not be presented as bad user credentials.
    if (err?.name === 'CastError') {
      return res.status(401).json({ error: 'invalid token' });
    }
    logSafeError('auth session lookup failed', err);
    return res.status(503).json({ error: 'authentication temporarily unavailable' });
  }
}
