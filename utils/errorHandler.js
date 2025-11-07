// utils/errorHandler.js
// Centralized error handling utilities

/**
 * Sanitize error messages for client responses
 * Returns generic messages in production, detailed messages in development
 */
export function sanitizeError(error, context = '') {
  const isDev = process.env.NODE_ENV !== 'production';

  // Log full error details server-side
  if (context) {
    console.error(`[${context}]`, error);
  } else {
    console.error('Error:', error);
  }

  // Return safe message to client
  if (isDev) {
    return {
      error: error.message || 'An error occurred',
      context: context || undefined,
      stack: error.stack?.split('\n').slice(0, 3).join('\n') // First 3 lines of stack
    };
  }

  return {
    error: 'An error occurred. Please try again later.'
  };
}

/**
 * Standard error response helpers
 */
export const errorResponses = {
  // 400 - Bad Request
  badRequest: (res, message = 'Invalid request') => {
    return res.status(400).json({ error: message });
  },

  // 401 - Unauthorized
  unauthorized: (res, message = 'Authentication required') => {
    return res.status(401).json({ error: message });
  },

  // 403 - Forbidden
  forbidden: (res, message = 'Access denied') => {
    return res.status(403).json({ error: message });
  },

  // 404 - Not Found
  notFound: (res, message = 'Resource not found') => {
    return res.status(404).json({ error: message });
  },

  // 409 - Conflict
  conflict: (res, message = 'Resource conflict') => {
    return res.status(409).json({ error: message });
  },

  // 422 - Unprocessable Entity
  validationError: (res, message = 'Validation failed') => {
    return res.status(422).json({ error: message });
  },

  // 429 - Too Many Requests
  tooManyRequests: (res, message = 'Too many requests. Please try again later.') => {
    return res.status(429).json({ error: message });
  },

  // 500 - Internal Server Error
  internalError: (res, context = '', error = null) => {
    if (error) {
      console.error(`[${context}]`, error);
    }

    const message = process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : `Internal server error: ${context}`;

    return res.status(500).json({ error: message });
  }
};

/**
 * Express error handling middleware
 * Place this at the end of your middleware stack
 */
export function globalErrorHandler(err, req, res, next) {
  // Log the full error with request context
  console.error('💥 Unhandled error:', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    body: req.body,
    query: req.query
  });

  // Determine status code
  const status = err.status || err.statusCode || 500;

  // Send safe error response
  const message = process.env.NODE_ENV === 'production'
    ? 'An unexpected error occurred'
    : err.message || 'Server error';

  res.status(status).json({ error: message });
}
