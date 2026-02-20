// middleware/rateLimiter.js
// Rate limiting configuration for different endpoint types

import rateLimit from 'express-rate-limit';

// General API rate limiter - applies to most endpoints
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Limit each IP to 1000 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.'
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  validate: false, // Avoid proxy/env false positives crashing requests in mixed dev setups
  // Skip rate limiting for health checks and static files
  skip: (req) => {
    return req.path === '/health' ||
           req.path.startsWith('/uploads/') ||
           req.path.startsWith('/public/');
  }
});

// Strict rate limiter for authentication endpoints
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 login/register attempts per 15 minutes
  message: {
    error: 'Too many authentication attempts, please try again after 15 minutes.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  skipSuccessfulRequests: true, // Don't count successful login/register
});

// Very strict rate limiter for password reset requests
export const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // Limit each IP to 3 password reset requests per hour
  message: {
    error: 'Too many password reset attempts, please try again after an hour.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
});

// Moderate rate limiter for write operations (POST, PUT, PATCH, DELETE)
export const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // Limit each IP to 200 write operations per 15 minutes
  message: {
    error: 'Too many write operations, please slow down.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  skip: (req) => {
    // Only apply to write operations
    return !['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
  }
});
