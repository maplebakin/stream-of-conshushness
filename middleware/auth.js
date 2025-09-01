// middleware/auth.js — public-path allowlist + resilient claims
import jwt from 'jsonwebtoken';

const PUBLIC_PATHS = [
  '/health',
];
function isPublic(req) {
  // Allow all auth endpoints: /api/auth, /api/auth/login, /api/auth/register, etc.
  if (/^\/api\/auth(\/|$)/.test(req.path)) return true;
  // Allow health + any static/public assets if you serve them
  if (PUBLIC_PATHS.includes(req.path)) return true;
  if (req.path.startsWith('/public/')) return true;
  return false;
}

export default function auth(req, res, next) {
  if (isPublic(req)) return next();

  const hdr = req.headers.authorization || '';
  const token = hdr.replace(/^Bearer\s+/i, '').trim();
  if (!token) return res.status(401).json({ error: 'missing token' });

  try {
    const secret = process.env.JWT_SECRET;
    if (!secret || String(secret).length < 12) {
      return res.status(500).json({ error: 'server jwt misconfigured' });
    }
    const payload = jwt.verify(token, secret);

    // Be generous in what we accept; normalize a few common shapes:
    req.user = { ...(req.user || {}), ...payload };
    if (!req.user.userId) req.user.userId = payload.userId || payload.id || payload._id;

    if (!req.user.userId) {
      // Still no user id — some apps encode under sub:
      if (payload.sub) req.user.userId = payload.sub;
    }

    return next();
  } catch (err) {
    return res.status(401).json({ error: 'invalid token' });
  }
}
