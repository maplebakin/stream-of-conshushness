// middleware/__tests__/auth.test.js
// Tests for JWT authentication middleware

import { describe, it, expect, beforeEach, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import auth from '../auth.js';

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
  });

  describe('Public paths', () => {
    it('should allow /health endpoint without token', () => {
      req.path = '/health';
      auth(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should allow /api/auth/* paths without token', () => {
      req.path = '/api/auth/login';
      auth(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should allow /api/auth/register without token', () => {
      req.path = '/api/auth/register';
      auth(req, res, next);
      expect(next).toHaveBeenCalled();
    });
  });

  describe('Protected paths', () => {
    it('should reject requests without Authorization header', () => {
      auth(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'missing token' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject requests with empty Bearer token', () => {
      req.headers.authorization = 'Bearer ';
      auth(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'missing token' });
    });

    it('should reject requests with invalid token', () => {
      req.headers.authorization = 'Bearer invalid_token_here';
      auth(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'invalid token' });
    });

    it('should accept requests with valid JWT token', () => {
      const token = jwt.sign(
        { userId: '123', username: 'testuser' },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );
      req.headers.authorization = `Bearer ${token}`;

      auth(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.user).toBeDefined();
      expect(req.user.userId).toBe('123');
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should normalize userId from different claim shapes', () => {
      // Test with 'id' claim
      const token = jwt.sign(
        { id: '456', username: 'testuser' },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );
      req.headers.authorization = `Bearer ${token}`;

      auth(req, res, next);

      expect(req.user.userId).toBe('456');
    });

    it('should handle Bearer token case-insensitively', () => {
      const token = jwt.sign(
        { userId: '789' },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );
      req.headers.authorization = `bearer ${token}`;

      auth(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.user.userId).toBe('789');
    });

    it('should reject expired tokens', () => {
      const token = jwt.sign(
        { userId: '999' },
        process.env.JWT_SECRET,
        { expiresIn: '-1h' } // Expired 1 hour ago
      );
      req.headers.authorization = `Bearer ${token}`;

      auth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'invalid token' });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('JWT_SECRET validation', () => {
    it('should return 500 if JWT_SECRET is too short', () => {
      process.env.JWT_SECRET = 'short'; // Less than 12 chars
      const token = 'some_token';
      req.headers.authorization = `Bearer ${token}`;

      auth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
    });

    it('should return 500 if JWT_SECRET is missing', () => {
      delete process.env.JWT_SECRET;
      const token = 'some_token';
      req.headers.authorization = `Bearer ${token}`;

      auth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
    });
  });
});
