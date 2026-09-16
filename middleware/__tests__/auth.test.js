// middleware/__tests__/auth.test.js
// Tests for JWT authentication middleware

import { describe, it, expect, beforeEach, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import auth from '../auth.js';

const userMocks = vi.hoisted(() => ({
  findById: vi.fn(),
  select: vi.fn(),
}));

vi.mock('../../models/User.js', () => ({
  default: {
    findById: (...args) => userMocks.findById(...args),
  },
}));

describe('Auth Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    // Mock request, response, and next function
    req = {
      path: '/api/tasks',
      headers: {},
      user: undefined
    };
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis()
    };
    next = vi.fn();

    // Set JWT_SECRET for tests
    process.env.JWT_SECRET = 'test_secret_key_minimum_12_chars';
    userMocks.select.mockResolvedValue({ _id: 'test-user', authVersion: 0 });
    userMocks.findById.mockReturnValue({ select: userMocks.select });
  });

  describe('Public paths', () => {
    it('should allow /health endpoint without token', async () => {
      req.path = '/health';
      await auth(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should allow /api/auth/* paths without token', async () => {
      req.path = '/api/auth/login';
      await auth(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should allow /api/auth/register without token', async () => {
      req.path = '/api/auth/register';
      await auth(req, res, next);
      expect(next).toHaveBeenCalled();
    });
  });

  describe('Protected paths', () => {
    it('should reject requests without Authorization header', async () => {
      await auth(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'missing token' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject requests with empty Bearer token', async () => {
      req.headers.authorization = 'Bearer ';
      await auth(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'missing token' });
    });

    it('should reject requests with invalid token', async () => {
      req.headers.authorization = 'Bearer invalid_token_here';
      await auth(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'invalid token' });
      expect(userMocks.findById).not.toHaveBeenCalled();
    });

    it('accepts a legacy version-0 JWT when the user is still version 0', async () => {
      const token = jwt.sign(
        { userId: '123', username: 'testuser' },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );
      req.headers.authorization = `Bearer ${token}`;

      await auth(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.user).toBeDefined();
      expect(req.user.userId).toBe('123');
      expect(req.user.authVersion).toBe(0);
      expect(userMocks.findById).toHaveBeenCalledWith('123');
      expect(userMocks.select).toHaveBeenCalledWith('_id authVersion');
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should normalize userId from different claim shapes', async () => {
      // Test with 'id' claim
      const token = jwt.sign(
        { id: '456', username: 'testuser' },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );
      req.headers.authorization = `Bearer ${token}`;

      await auth(req, res, next);

      expect(req.user.userId).toBe('456');
    });

    it('should handle Bearer token case-insensitively', async () => {
      const token = jwt.sign(
        { userId: '789' },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );
      req.headers.authorization = `bearer ${token}`;

      await auth(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.user.userId).toBe('789');
    });

    it('should reject expired tokens', async () => {
      const token = jwt.sign(
        { userId: '999' },
        process.env.JWT_SECRET,
        { expiresIn: '-1h' } // Expired 1 hour ago
      );
      req.headers.authorization = `Bearer ${token}`;

      await auth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'invalid token' });
      expect(next).not.toHaveBeenCalled();
    });

    it('accepts a JWT whose auth version matches the user record', async () => {
      userMocks.select.mockResolvedValueOnce({ _id: 'versioned-user', authVersion: 4 });
      const token = jwt.sign(
        { userId: 'versioned-user', authVersion: 4 },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );
      req.headers.authorization = `Bearer ${token}`;

      await auth(req, res, next);

      expect(next).toHaveBeenCalledOnce();
      expect(req.user.authVersion).toBe(4);
    });

    it('rejects a JWT issued before the user auth version changed', async () => {
      userMocks.select.mockResolvedValueOnce({ _id: 'versioned-user', authVersion: 5 });
      const token = jwt.sign(
        { userId: 'versioned-user', authVersion: 4 },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );
      req.headers.authorization = `Bearer ${token}`;

      await auth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'invalid token' });
      expect(next).not.toHaveBeenCalled();
    });

    it('rejects a validly signed JWT when its user no longer exists', async () => {
      userMocks.select.mockResolvedValueOnce(null);
      const token = jwt.sign({ userId: 'deleted-user' }, process.env.JWT_SECRET, { expiresIn: '1h' });
      req.headers.authorization = `Bearer ${token}`;

      await auth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'invalid token' });
    });

    it('reports a user lookup outage separately from an invalid token', async () => {
      const logSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      userMocks.select.mockRejectedValueOnce(new Error('database unavailable'));
      const token = jwt.sign({ userId: '123' }, process.env.JWT_SECRET, { expiresIn: '1h' });
      req.headers.authorization = `Bearer ${token}`;

      await auth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith({ error: 'authentication temporarily unavailable' });
      expect(next).not.toHaveBeenCalled();
      logSpy.mockRestore();
    });
  });

  describe('JWT_SECRET validation', () => {
    it('should return 500 if JWT_SECRET is too short', async () => {
      process.env.JWT_SECRET = 'short'; // Less than 12 chars
      const token = 'some_token';
      req.headers.authorization = `Bearer ${token}`;

      await auth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
    });

    it('should return 500 if JWT_SECRET is missing', async () => {
      delete process.env.JWT_SECRET;
      const token = 'some_token';
      req.headers.authorization = `Bearer ${token}`;

      await auth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
    });
  });
});
