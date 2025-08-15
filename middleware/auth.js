// /middleware/auth.js
import jwt from 'jsonwebtoken';

export const authenticateToken = (req, res, next) => {
  const header = req.header('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Access denied' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Normalize so routers can always use req.user.userId
    const userId = decoded.userId || decoded.id || decoded._id;
    if (!userId) return res.status(401).json({ error: 'Invalid token payload' });

    req.user = { ...decoded, userId };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
};

// Export both named and default so either import style works
export default authenticateToken;
